// ポイント表示・編集管理クラス
import { CONFIG } from './config.js';

export class PointManager {
    constructor(mapManager, gpsDataManager) {
        this.mapManager = mapManager;
        this.gpsDataManager = gpsDataManager;
        this.markers = new Map(); // pointId -> marker
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.isAddingPoint = false;
        this.isMovingPoint = false;
        
        this.initEventHandlers();
    }

    // イベントハンドラーを初期化
    initEventHandlers() {
        // 地図クリックでポイント追加モード時の処理
        this.mapManager.onMapClick((e) => {
            if (this.isAddingPoint) {
                this.addPointAtLocation(e.latlng);
                this.setAddingMode(false);
            }
        });
    }

    // すべてのポイントを地図に表示
    displayAllPoints() {
        this.clearAllMarkers();
        
        const points = this.gpsDataManager.getAllPoints();
        points.forEach(point => {
            this.addMarkerForPoint(point);
        });

        this.updatePointCountDisplay();
    }

    // 指定ポイントのマーカーを追加
    addMarkerForPoint(point) {
        const marker = L.circleMarker([point.lat, point.lng], {
            radius: CONFIG.POINT_MARKER_RADIUS,
            fillColor: CONFIG.POINT_MARKER_COLOR,
            color: CONFIG.POINT_MARKER_COLOR,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6
        }).addTo(this.mapManager.getMap());

        // マーカークリックイベント
        marker.on('click', () => {
            this.selectPoint(point.id);
        });

        // ドラッグ可能に設定
        marker.on('dragend', (e) => {
            if (this.isMovingPoint && this.selectedPointId === point.id) {
                const newLatLng = e.target.getLatLng();
                this.updatePointPosition(point.id, newLatLng.lat, newLatLng.lng);
            }
        });

        this.markers.set(point.id, marker);
        
        // ツールチップ表示
        marker.bindTooltip(point.id, {
            permanent: false,
            direction: 'top',
            offset: [0, -10]
        });
    }

    // 指定位置にポイントを追加
    addPointAtLocation(latlng) {
        const point = this.gpsDataManager.addPoint(latlng.lat, latlng.lng);
        this.addMarkerForPoint(point);
        this.selectPoint(point.id);
        this.updatePointCountDisplay();
        this.showMessage(CONFIG.MESSAGES.POINT_ADDED);
    }

    // ポイントを選択
    async selectPoint(pointId) {
        // 前回選択されたマーカーの色をリセット
        if (this.selectedMarker) {
            this.selectedMarker.setStyle({
                fillColor: CONFIG.POINT_MARKER_COLOR,
                color: CONFIG.POINT_MARKER_COLOR
            });
        }

        // 新しいマーカーを選択
        const marker = this.markers.get(pointId);
        if (marker) {
            marker.setStyle({
                fillColor: CONFIG.SELECTED_POINT_COLOR,
                color: CONFIG.SELECTED_POINT_COLOR
            });
            
            this.selectedMarker = marker;
            this.selectedPointId = pointId;
            
            // ポイント情報を表示
            const point = this.gpsDataManager.getPointById(pointId);
            if (point) {
                this.updatePointInfoDisplay(point);
                
                // 経度・緯度から標高を取得してGPS標高に設定
                await this.fetchAndUpdateElevation(point);
            }
        }
    }

    // 標高を取得してGPS標高フィールドを更新
    async fetchAndUpdateElevation(point) {
        try {
            // GPS標高が既に設定されている場合はスキップ
            if (point.gpsElevation && point.gpsElevation !== '') {
                return;
            }

            const elevation = await this.gpsDataManager.fetchElevationFromAPI(point.lat, point.lng);
            
            if (elevation !== null) {
                // GPS標高を更新
                const updates = { gpsElevation: String(elevation) };
                this.gpsDataManager.updatePoint(point.id, updates);
                
                // 表示も更新
                document.getElementById('gpsElevationField').value = elevation;
                
                // this.showMessage(`標高データを取得しました: ${elevation}m`);
            }
        } catch (error) {
            console.warn('標高取得中にエラーが発生しました:', error);
        }
    }

    // ポイントの位置を更新
    updatePointPosition(pointId, lat, lng) {
        const point = this.gpsDataManager.updatePoint(pointId, { lat, lng });
        if (point) {
            this.updatePointInfoDisplay(point);
            this.showMessage(CONFIG.MESSAGES.POINT_MOVED);
        }
    }

    // 選択されたポイントを削除
    deleteSelectedPoint() {
        if (!this.selectedPointId) {
            this.showMessage(CONFIG.MESSAGES.NO_POINT_SELECTED);
            return;
        }

        // マーカーを地図から削除
        const marker = this.markers.get(this.selectedPointId);
        if (marker) {
            this.mapManager.getMap().removeLayer(marker);
            this.markers.delete(this.selectedPointId);
        }

        // データから削除
        this.gpsDataManager.removePoint(this.selectedPointId);
        
        // 選択状態をクリア
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.clearPointInfoDisplay();
        
        this.updatePointCountDisplay();
        this.showMessage(CONFIG.MESSAGES.POINT_DELETED);
    }

    // 全マーカーを削除
    clearAllMarkers() {
        this.markers.forEach(marker => {
            this.mapManager.getMap().removeLayer(marker);
        });
        this.markers.clear();
        this.selectedMarker = null;
        this.selectedPointId = null;
    }

    // ポイント追加モードの設定
    setAddingMode(enabled) {
        this.isAddingPoint = enabled;
        document.body.style.cursor = enabled ? 'crosshair' : 'default';
    }

    // ポイント移動モードの設定
    setMovingMode(enabled) {
        this.isMovingPoint = enabled;
        
        // すべてのマーカーのドラッグ可能状態を更新
        this.markers.forEach(marker => {
            if (enabled) {
                marker.options.draggable = true;
                marker.dragging.enable();
            } else {
                marker.options.draggable = false;
                marker.dragging.disable();
            }
        });
        
        document.body.style.cursor = enabled ? 'move' : 'default';
    }

    // ポイント情報表示を更新
    updatePointInfoDisplay(point) {
        document.getElementById('pointIdField').value = point.id;
        document.getElementById('latDecimalField').value = point.lat.toFixed(5);
        document.getElementById('lngDecimalField').value = point.lng.toFixed(5);
        document.getElementById('dmsField').value = 
            this.formatDMSCoordinates(point.lng, point.lat);
        document.getElementById('elevationField').value = point.elevation;
        document.getElementById('gpsElevationField').value = point.gpsElevation;
        document.getElementById('locationField').value = point.location;
    }

    // ポイント情報表示をクリア
    clearPointInfoDisplay() {
        document.getElementById('pointIdField').value = '';
        document.getElementById('latDecimalField').value = '';
        document.getElementById('lngDecimalField').value = '';
        document.getElementById('dmsField').value = '';
        document.getElementById('elevationField').value = '';
        document.getElementById('gpsElevationField').value = '';
        document.getElementById('locationField').value = '';
    }

    // ポイント数表示を更新
    updatePointCountDisplay() {
        const count = this.gpsDataManager.getPointCount();
        document.getElementById('pointCountField').value = count;
    }

    // 選択されたポイントの情報を更新
    updateSelectedPointInfo() {
        if (!this.selectedPointId) return;

        const updates = {
            id: document.getElementById('pointIdField').value,
            elevation: document.getElementById('elevationField').value,
            gpsElevation: document.getElementById('gpsElevationField').value,
            location: document.getElementById('locationField').value
        };

        this.gpsDataManager.updatePoint(this.selectedPointId, updates);
        
        // IDが変更された場合、マーカーのマップを更新
        if (updates.id !== this.selectedPointId) {
            const marker = this.markers.get(this.selectedPointId);
            this.markers.delete(this.selectedPointId);
            this.markers.set(updates.id, marker);
            this.selectedPointId = updates.id;
            
            // ツールチップを更新
            marker.setTooltipContent(updates.id);
        }
    }

    // DMS座標を「東経・北緯」順でE/N付きでフォーマット
    formatDMSCoordinates(lng, lat) {
        const lngDMS = this.toDMSWithDirection(lng, true);
        const latDMS = this.toDMSWithDirection(lat, false);
        return `${lngDMS} ${latDMS}`;
    }
    
    // 10進数をDMS形式に変換（E/N方向付き）
    toDMSWithDirection(decimal, isLongitude) {
        const absDecimal = Math.abs(decimal);
        const degrees = Math.floor(absDecimal);
        const minutes = Math.floor((absDecimal - degrees) * 60);
        const seconds = ((absDecimal - degrees - minutes / 60) * 3600).toFixed(2);
        
        let direction;
        if (isLongitude) {
            direction = decimal >= 0 ? 'E' : 'W';
        } else {
            direction = decimal >= 0 ? 'N' : 'S';
        }
        
        return `${degrees}°${minutes}'${seconds}"${direction}`;
    }

    // メッセージを表示
    showMessage(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = message;
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, CONFIG.MESSAGE_DISPLAY_DURATION);
    }
}