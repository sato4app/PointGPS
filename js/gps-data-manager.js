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
        console.log('ヘッダー行:', jsonData[0]);
        
        // ヘッダー行をスキップして、2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            console.log(`行${i+1}:`, row);
            
            if (row.length >= 3 && row[1] && row[2]) {
                const point = {
                    id: row[0] || `P${this.nextId++}`,
                    lat: this.parseLatLng(row[1]),
                    lng: this.parseLatLng(row[2]),
                    elevation: row[3] || '',
                    gpsElevation: row[4] || '',
                    location: row[5] || ''
                };
                
                console.log('解析されたポイント:', point);
                console.log('緯度が有効:', !isNaN(point.lat), '経度が有効:', !isNaN(point.lng));
                
                if (!isNaN(point.lat) && !isNaN(point.lng)) {
                    this.gpsPoints.push(point);
                    console.log('ポイント追加成功');
                } else {
                    console.log('ポイント追加失敗 - 無効な座標値');
                }
            } else {
                console.log(`行${i+1}をスキップ - 条件不適合:`, 
                    'row.length>=3:', row.length >= 3, 
                    'row[1]存在:', !!row[1], 
                    'row[2]存在:', !!row[2]);
            }
        }
        
        console.log('解析完了 - 有効ポイント数:', this.gpsPoints.length);
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