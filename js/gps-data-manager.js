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
                elevation: this.getCellValue(row, columnIndexes.elevation) || '',
                gpsElevation: this.getCellValue(row, columnIndexes.gpsElevation) || '',
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
            // 場所: "位置"または"場所"を含む
            else if (header.includes('位置') || header.includes('場所')) {
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

    // GeoJSONファイルを読み込む
    async loadGeoJSONFile(file) {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }
        
        try {
            const jsonData = await this.fileHandler.loadGeoJSONFile(file);
            this.parseGeoJSONData(jsonData);
            return this.gpsPoints.length;
        } catch (error) {
            throw error;
        }
    }

    // GeoJSONデータを解析
    parseGeoJSONData(geojsonData) {
        this.gpsPoints = [];
        
        if (geojsonData.type !== 'FeatureCollection' || !Array.isArray(geojsonData.features)) {
            throw new Error('無効なGeoJSON形式です');
        }
        
        geojsonData.features.forEach((feature, index) => {
            if (feature.type === 'Feature' && 
                feature.geometry && 
                feature.geometry.type === 'Point' && 
                Array.isArray(feature.geometry.coordinates) &&
                feature.geometry.coordinates.length >= 2) {
                
                const coords = feature.geometry.coordinates;
                const properties = feature.properties || {};
                
                const point = {
                    id: properties.id || properties.name || `P${this.nextId++}`,
                    lat: coords[1],
                    lng: coords[0],
                    elevation: properties.elevation || properties['標高'] || '',
                    gpsElevation: properties.gpsElevation || properties['GPS標高'] || '',
                    location: properties.location || properties['場所'] || properties['位置'] || ''
                };
                
                if (!isNaN(point.lat) && !isNaN(point.lng)) {
                    this.gpsPoints.push(point);
                }
            }
        });
    }

    // GeoJSONとして出力
    async exportToGeoJSON(filename = 'gps_points') {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }
        
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

        return await this.fileHandler.saveGeoJSONWithUserChoice(geojson, filename);
    }
}