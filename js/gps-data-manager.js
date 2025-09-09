// GPSデータ管理クラス
export class GPSDataManager {
    constructor(fileHandler = null) {
        this.gpsPoints = [];
        this.nextId = 1;
        this.fileHandler = fileHandler;
    }

    // Excelファイルを読み込む
    async loadExcelFile(file) {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }
        
        try {
            const jsonData = await this.fileHandler.loadExcelFile(file);
            this.parseExcelData(jsonData);
            
            // 標高が正の値でないポイントをAPIから取得（バックグラウンド処理）
            this.fetchMissingElevations();
            
            return this.gpsPoints.length;
        } catch (error) {
            throw error;
        }
    }
    
    // 標高が正の値でないポイントの標高をAPIから取得
    async fetchMissingElevations() {
        const pointsNeedingElevation = this.gpsPoints.filter(point => !this.isPositiveElevation(point.elevation));
        
        for (const point of pointsNeedingElevation) {
            try {
                await this.ensureValidElevation(point.id);
                // 少し間隔を空けてAPI呼び出し
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.warn(`ポイント ${point.id} の標高取得に失敗しました:`, error);
            }
        }
    }

    // Excelデータを解析
    parseExcelData(jsonData) {
        this.gpsPoints = [];
        
        if (jsonData.length < 2) {
            return;
        }
        
        const headerRow = jsonData[0];
        
        // ヘッダー行から列のインデックスを特定
        const columnIndexes = this.identifyColumns(headerRow);
        
        if (!columnIndexes.lat || !columnIndexes.lng) {
            return;
        }
        
        // 2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 行に十分なデータがあるかチェック
            if (row.length === 0 || this.isEmptyRow(row)) {
                continue;
            }
            
            const point = {
                id: this.getCellValue(row, columnIndexes.id) || `P${this.nextId++}`,
                lat: this.parseLatLng(this.getCellValue(row, columnIndexes.lat)),
                lng: this.parseLatLng(this.getCellValue(row, columnIndexes.lng)),
                elevation: this.normalizeElevation(this.getCellValue(row, columnIndexes.elevation)),
                location: this.getCellValue(row, columnIndexes.location) || ''
            };
            
            if (!isNaN(point.lat) && !isNaN(point.lng)) {
                this.gpsPoints.push(point);
            }
        }
    }

    // ヘッダー行から各列のインデックスを特定
    identifyColumns(headerRow) {
        const indexes = {};
        
        for (let i = 0; i < headerRow.length; i++) {
            const header = String(headerRow[i]).trim();
            
            // ポイントID名: "ポイント"を含む
            if (header.includes('ポイント')) {
                indexes.id = i;
            }
            // 緯度: "緯度"と合致
            else if (header === '緯度') {
                indexes.lat = i;
            }
            // 経度: "経度"と合致
            else if (header === '経度') {
                indexes.lng = i;
            }
            // 標高: "標高"と合致
            else if (header === '標高') {
                indexes.elevation = i;
            }
            // 場所: "名称"、"位置"または"場所"を含む
            else if (header.includes('名称') || header.includes('位置') || header.includes('場所')) {
                indexes.location = i;
            }
        }
        
        return indexes;
    }

    // セルの値を安全に取得
    getCellValue(row, index) {
        if (index === undefined || index >= row.length) {
            return '';
        }
        const value = row[index];
        return value !== undefined && value !== null ? String(value).trim() : '';
    }

    // 空行かどうかをチェック
    isEmptyRow(row) {
        return row.every(cell => 
            cell === undefined || 
            cell === null || 
            String(cell).trim() === ''
        );
    }

    // 緯度経度を10進数形式に変換
    parseLatLng(value) {
        if (typeof value === 'number') {
            return value;
        }
        
        if (typeof value === 'string') {
            // DMS形式の場合の変換処理
            const dmsMatch = value.match(/(\d+)[°度]\s*(\d+)[\'分]\s*([\d.]+)[\"秒]/);
            if (dmsMatch) {
                const degrees = parseFloat(dmsMatch[1]);
                const minutes = parseFloat(dmsMatch[2]);
                const seconds = parseFloat(dmsMatch[3]);
                return degrees + minutes / 60 + seconds / 3600;
            }
            
            // 通常の数値文字列として解析
            return parseFloat(value);
        }
        
        return NaN;
    }

    // 10進数をDMS形式に変換
    toDMS(decimal) {
        const degrees = Math.floor(Math.abs(decimal));
        const minutes = Math.floor((Math.abs(decimal) - degrees) * 60);
        const seconds = ((Math.abs(decimal) - degrees - minutes / 60) * 3600).toFixed(2);
        const direction = decimal >= 0 ? '' : '-';
        return `${direction}${degrees}°${minutes}'${seconds}"`;
    }

    // 標高値を正規化（数値の場合は小数点1位まで、123.0は123にする）
    normalizeElevation(elevation) {
        if (!elevation || elevation === '') {
            return '';
        }
        
        const numValue = parseFloat(elevation);
        if (!isNaN(numValue)) {
            // 小数点1位まで表示し、.0の場合は整数表示
            const formatted = numValue.toFixed(1);
            return formatted.endsWith('.0') ? String(Math.round(numValue)) : formatted;
        }
        
        // 数値として扱えない場合はそのまま返す
        return String(elevation);
    }

    // 国土地理院の標高APIから標高データを取得
    async fetchElevationFromAPI(lat, lng) {
        try {
            const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error('標高APIへのアクセスに失敗しました');
            }
            
            const data = await response.json();
            
            if (data.elevation !== null && data.elevation !== undefined) {
                // 標高データを小数点1位まで、123.0は123にする
                const elevation = parseFloat(data.elevation);
                const formatted = elevation.toFixed(1);
                return formatted.endsWith('.0') ? Math.round(elevation) : parseFloat(formatted);
            }
            
            return null;
        } catch (error) {
            console.warn('標高取得エラー:', error);
            return null;
        }
    }

    // ポイントを追加
    addPoint(lat, lng, id = null, elevation = '', location = '') {
        const point = {
            id: id || this.generateTemporaryId(),
            lat: lat,
            lng: lng,
            elevation: this.normalizeElevation(elevation),
            location: location
        };
        
        this.gpsPoints.push(point);
        return point;
    }
    
    // 標高が正の値かチェックする
    isPositiveElevation(elevation) {
        if (!elevation || elevation === '') {
            return false;
        }
        
        const numValue = parseFloat(elevation);
        return !isNaN(numValue) && numValue > 0;
    }
    
    // 標高を設定または更新（正の値でない場合はAPIから取得）
    async ensureValidElevation(pointId) {
        const point = this.getPointById(pointId);
        if (!point) return null;
        
        // 既に正の標高値がある場合はそのまま
        if (this.isPositiveElevation(point.elevation)) {
            return point.elevation;
        }
        
        // APIから標高を取得
        try {
            const elevation = await this.fetchElevationFromAPI(point.lat, point.lng);
            if (elevation !== null && elevation > 0) {
                const formattedElevation = String(elevation);
                this.updatePoint(pointId, { elevation: formattedElevation });
                return formattedElevation;
            }
        } catch (error) {
            console.warn('標高取得に失敗しました:', error);
        }
        
        return point.elevation;
    }
    
    // 仮IDを生成（仮01から始まる連番）
    generateTemporaryId() {
        const existingTempIds = this.gpsPoints
            .map(p => p.id)
            .filter(id => id.match(/^仮\d{2}$/))
            .map(id => parseInt(id.substring(1)))
            .sort((a, b) => a - b);
        
        let nextNum = 1;
        for (const num of existingTempIds) {
            if (num === nextNum) {
                nextNum++;
            } else {
                break;
            }
        }
        
        return `仮${nextNum.toString().padStart(2, '0')}`;
    }

    // ポイントを更新
    updatePoint(pointId, updates) {
        const index = this.gpsPoints.findIndex(p => p.id === pointId);
        if (index !== -1) {
            // 標高データがある場合は正規化
            if ('elevation' in updates) {
                updates.elevation = this.normalizeElevation(updates.elevation);
            }
            if ('gpsElevation' in updates) {
                updates.gpsElevation = this.normalizeElevation(updates.gpsElevation);
            }
            
            Object.assign(this.gpsPoints[index], updates);
            return this.gpsPoints[index];
        }
        return null;
    }

    // ポイントを削除
    removePoint(pointId) {
        const index = this.gpsPoints.findIndex(p => p.id === pointId);
        if (index !== -1) {
            const removedPoint = this.gpsPoints.splice(index, 1)[0];
            return removedPoint;
        }
        return null;
    }

    // すべてのポイントを取得
    getAllPoints() {
        return [...this.gpsPoints];
    }

    // ポイント数を取得
    getPointCount() {
        return this.gpsPoints.length;
    }

    // IDでポイントを検索
    getPointById(id) {
        return this.gpsPoints.find(p => p.id === id);
    }

    // Excelファイルとして出力
    async exportToExcel(filename = 'gps_points') {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }
        
        const data = [
            ['ID', '緯度', '経度', '標高', 'GPS標高', '場所'] // ヘッダー
        ];

        this.gpsPoints.forEach(point => {
            data.push([
                point.id,
                point.lat,
                point.lng,
                point.elevation,
                point.gpsElevation,
                point.location
            ]);
        });

        return await this.fileHandler.saveExcelWithUserChoice(data, filename);
    }

}