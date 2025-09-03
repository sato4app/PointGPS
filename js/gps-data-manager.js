// GPSデータ管理クラス
export class GPSDataManager {
    constructor() {
        this.gpsPoints = [];
        this.nextId = 1;
    }

    // Excelファイルを読み込む
    async loadExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 最初のシートを取得
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // JSONに変換
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    // データを解析してGPSポイントに変換
                    this.parseExcelData(jsonData);
                    
                    resolve(this.gpsPoints.length);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    // Excelデータを解析
    parseExcelData(jsonData) {
        this.gpsPoints = [];
        
        // ヘッダー行をスキップして、2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row.length >= 3 && row[1] && row[2]) {
                const point = {
                    id: row[0] || `P${this.nextId++}`,
                    lat: this.parseLatLng(row[1]),
                    lng: this.parseLatLng(row[2]),
                    elevation: row[3] || '',
                    gpsElevation: row[4] || '',
                    location: row[5] || ''
                };
                
                if (!isNaN(point.lat) && !isNaN(point.lng)) {
                    this.gpsPoints.push(point);
                }
            }
        }
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