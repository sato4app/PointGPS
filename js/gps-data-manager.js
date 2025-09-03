// GPSデータ管理クラス
export class GPSDataManager {
    constructor() {
        this.gpsPoints = [];
        this.nextId = 1;
    }

    // Excelファイルを読み込む
    async loadExcelFile(file) {
        return new Promise((resolve, reject) => {
            console.log('Excel読み込み開始:', file.name, file.size, 'bytes');
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    console.log('ファイル読み込み完了 - バイト数:', e.target.result.byteLength);
                    
                    const data = new Uint8Array(e.target.result);
                    console.log('Uint8Array作成完了');
                    
                    const workbook = XLSX.read(data, { type: 'array' });
                    console.log('Workbook読み込み完了');
                    console.log('シート名一覧:', workbook.SheetNames);
                    
                    // 最初のシートを取得
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    console.log('対象シート:', firstSheetName);
                    console.log('ワークシート内容:', worksheet);
                    
                    // JSONに変換
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    console.log('JSON変換完了');
                    
                    // データを解析してGPSポイントに変換
                    this.parseExcelData(jsonData);
                    
                    resolve(this.gpsPoints.length);
                } catch (error) {
                    console.error('Excel処理エラー:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                console.error('ファイル読み込みエラー');
                reject(new Error('ファイル読み込みエラー'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    // Excelデータを解析
    parseExcelData(jsonData) {
        this.gpsPoints = [];
        
        console.log('Excel解析開始:');
        console.log('総行数:', jsonData.length);
        
        if (jsonData.length < 2) {
            console.log('データ不足 - ヘッダー行とデータ行が必要');
            return;
        }
        
        const headerRow = jsonData[0];
        console.log('ヘッダー行:', headerRow);
        
        // ヘッダー行から列のインデックスを特定
        const columnIndexes = this.identifyColumns(headerRow);
        console.log('特定された列インデックス:', columnIndexes);
        
        if (!columnIndexes.lat || !columnIndexes.lng) {
            console.log('必須列（緯度・経度）が見つかりません');
            return;
        }
        
        // 2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            console.log(`行${i+1}:`, row);
            
            // 行に十分なデータがあるかチェック
            if (row.length === 0 || this.isEmptyRow(row)) {
                console.log(`行${i+1}をスキップ - 空行`);
                continue;
            }
            
            const point = {
                id: this.getCellValue(row, columnIndexes.id) || `P${this.nextId++}`,
                lat: this.parseLatLng(this.getCellValue(row, columnIndexes.lat)),
                lng: this.parseLatLng(this.getCellValue(row, columnIndexes.lng)),
                elevation: this.getCellValue(row, columnIndexes.elevation) || '',
                gpsElevation: this.getCellValue(row, columnIndexes.gpsElevation) || '',
                location: this.getCellValue(row, columnIndexes.location) || ''
            };
            
            console.log('解析されたポイント:', point);
            console.log('緯度が有効:', !isNaN(point.lat), '経度が有効:', !isNaN(point.lng));
            
            if (!isNaN(point.lat) && !isNaN(point.lng)) {
                this.gpsPoints.push(point);
                console.log('ポイント追加成功');
            } else {
                console.log('ポイント追加失敗 - 無効な座標値');
            }
        }
        
        console.log('解析完了 - 有効ポイント数:', this.gpsPoints.length);
    }

    // ヘッダー行から各列のインデックスを特定
    identifyColumns(headerRow) {
        const indexes = {};
        
        for (let i = 0; i < headerRow.length; i++) {
            const header = String(headerRow[i]).trim();
            console.log(`列${i}: "${header}"`);
            
            // ポイントID名: "ポイント"を含む
            if (header.includes('ポイント')) {
                indexes.id = i;
                console.log('ポイントID列を特定:', i);
            }
            // 緯度: "緯度"と合致
            else if (header === '緯度') {
                indexes.lat = i;
                console.log('緯度列を特定:', i);
            }
            // 経度: "経度"と合致
            else if (header === '経度') {
                indexes.lng = i;
                console.log('経度列を特定:', i);
            }
            // 標高: "標高"と合致
            else if (header === '標高') {
                indexes.elevation = i;
                console.log('標高列を特定:', i);
            }
            // 場所: "位置"または"場所"を含む
            else if (header.includes('位置') || header.includes('場所')) {
                indexes.location = i;
                console.log('場所列を特定:', i);
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
        console.log('parseLatLng呼び出し - 入力値:', value, 'タイプ:', typeof value);
        
        if (typeof value === 'number') {
            console.log('数値として処理:', value);
            return value;
        }
        
        if (typeof value === 'string') {
            // DMS形式の場合の変換処理
            const dmsMatch = value.match(/(\d+)[°度]\s*(\d+)[\'分]\s*([\d.]+)[\"秒]/);
            if (dmsMatch) {
                const degrees = parseFloat(dmsMatch[1]);
                const minutes = parseFloat(dmsMatch[2]);
                const seconds = parseFloat(dmsMatch[3]);
                const result = degrees + minutes / 60 + seconds / 3600;
                console.log('DMS変換:', value, '->', result);
                return result;
            }
            
            // 通常の数値文字列として解析
            const result = parseFloat(value);
            console.log('文字列を数値変換:', value, '->', result);
            return result;
        }
        
        console.log('変換不可能な値:', value);
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

    // ポイントを追加
    addPoint(lat, lng, id = null, elevation = '', gpsElevation = '', location = '') {
        const point = {
            id: id || `P${this.nextId++}`,
            lat: lat,
            lng: lng,
            elevation: elevation,
            gpsElevation: gpsElevation,
            location: location
        };
        
        this.gpsPoints.push(point);
        return point;
    }

    // ポイントを更新
    updatePoint(pointId, updates) {
        const index = this.gpsPoints.findIndex(p => p.id === pointId);
        if (index !== -1) {
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
    exportToExcel() {
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

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'GPS_Points');
        
        XLSX.writeFile(workbook, 'gps_points.xlsx');
    }

    // GeoJSONとして出力
    exportToGeoJSON() {
        const geojson = {
            type: 'FeatureCollection',
            features: this.gpsPoints.map(point => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.lng, point.lat]
                },
                properties: {
                    id: point.id,
                    elevation: point.elevation,
                    gpsElevation: point.gpsElevation,
                    location: point.location
                }
            }))
        };

        const dataStr = JSON.stringify(geojson, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'gps_points.geojson';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}