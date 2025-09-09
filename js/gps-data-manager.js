// GPSデータ管理クラス
export class GPSDataManager {
    constructor(fileHandler = null) {
        this.gpsPoints = [];
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
            
            return this.gpsPoints.length;
        } catch (error) {
            throw error;
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
        
        // 必須項目（ポイントID、名称、緯度、経度）がすべて存在するかチェック
        const requiredColumns = ['id', 'location', 'lat', 'lng'];
        const missingColumns = requiredColumns.filter(col => 
            columnIndexes[col] === undefined || columnIndexes[col] === null
        );
        
        if (missingColumns.length > 0) {
            const missingNames = missingColumns.map(col => {
                switch(col) {
                    case 'id': return 'ポイントID';
                    case 'location': return '名称';
                    case 'lat': return '緯度';
                    case 'lng': return '経度';
                    default: return col;
                }
            });
            throw new Error(`必須項目が不足しています: ${missingNames.join(', ')}`);
        }
        
        // 2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 行に十分なデータがあるかチェック
            if (row.length === 0 || this.isEmptyRow(row)) {
                continue;
            }
            
            // 必須項目のデータを取得
            const idValue = this.getCellValue(row, columnIndexes.id);
            const locationValue = this.getCellValue(row, columnIndexes.location);
            const latValue = this.getCellValue(row, columnIndexes.lat);
            const lngValue = this.getCellValue(row, columnIndexes.lng);
            
            // 必須項目が空でないかチェック
            if (!idValue || !locationValue || !latValue || !lngValue) {
                continue; // 必須項目が欠けている行はスキップ
            }
            
            const lat = this.parseLatLng(latValue);
            const lng = this.parseLatLng(lngValue);
            
            // 緯度・経度が有効な数値かチェック
            if (isNaN(lat) || isNaN(lng)) {
                continue; // 無効な座標の行はスキップ
            }
            
            const point = {
                id: idValue,
                lat: lat,
                lng: lng,
                elevation: this.normalizeElevation(this.getCellValue(row, columnIndexes.elevation)),
                location: locationValue,
                remarks: this.getCellValue(row, columnIndexes.remarks) || ''
            };
            
            this.gpsPoints.push(point);
        }
    }

    // ヘッダー行から各列のインデックスを特定（完全一致）
    identifyColumns(headerRow) {
        const indexes = {};
        
        for (let i = 0; i < headerRow.length; i++) {
            const header = String(headerRow[i]).trim();
            
            // 完全一致判定
            if (header === 'ポイントID') {
                indexes.id = i;
            }
            else if (header === '名称') {
                indexes.location = i;
            }
            else if (header === '緯度') {
                indexes.lat = i;
            }
            else if (header === '経度') {
                indexes.lng = i;
            }
            else if (header === '標高') {
                indexes.elevation = i;
            }
            else if (header === '備考') {
                indexes.remarks = i;
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
    addPoint(lat, lng, id = null, elevation = '', location = '', remarks = '') {
        const point = {
            id: id || this.generateTemporaryId(),
            lat: lat,
            lng: lng,
            elevation: this.normalizeElevation(elevation),
            location: location,
            remarks: remarks
        };
        
        this.gpsPoints.push(point);
        return point;
    }
    
    // 標高がblankまたは0かチェックする（APIから取得が必要かどうか）
    needsElevationFromAPI(elevation) {
        if (!elevation || elevation === '') {
            return true; // blank の場合
        }
        
        const numValue = parseFloat(elevation);
        if (isNaN(numValue)) {
            return false; // 数値でない場合はAPIから取得しない
        }
        
        return numValue === 0; // 0 の場合のみAPIから取得
    }
    
    // 標高を設定または更新（blankまたは0の場合のみAPIから取得）
    async ensureValidElevation(pointId) {
        const point = this.getPointById(pointId);
        if (!point) return null;
        
        // API取得が必要でない場合はそのまま返す
        if (!this.needsElevationFromAPI(point.elevation)) {
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
            ['ポイントID', '名称', '緯度', '経度', '標高', '備考'] // ヘッダー
        ];

        this.gpsPoints.forEach(point => {
            // 標高を数値として処理（小数点1位まで）
            let elevationValue = '';
            if (point.elevation && point.elevation !== '') {
                const numElevation = parseFloat(point.elevation);
                if (!isNaN(numElevation)) {
                    const formatted = numElevation.toFixed(1);
                    elevationValue = formatted.endsWith('.0') ? Math.round(numElevation) : parseFloat(formatted);
                } else {
                    elevationValue = point.elevation; // 数値でない場合はそのまま
                }
            }
            
            data.push([
                point.id,
                point.location,
                parseFloat(point.lat.toFixed(5)), // 小数点以下5桁まで
                parseFloat(point.lng.toFixed(5)), // 小数点以下5桁まで
                elevationValue,
                point.remarks
            ]);
        });

        return await this.fileHandler.saveExcelWithUserChoice(data, filename);
    }

}