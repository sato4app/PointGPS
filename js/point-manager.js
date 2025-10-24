// ポイント表示・編集管理クラス
import { CONFIG } from './config.js';
import { DataUtils } from './data-utils.js';
import { ElevationAPI } from './elevation-api.js';

export class PointManager {
    constructor(mapManager, gpsDataManager) {
        this.mapManager = mapManager;
        this.gpsDataManager = gpsDataManager;
        this.markers = new Map(); // pointId -> marker
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.isAddingPoint = false;
        this.isMovingPoint = false;
        this.appInstance = null; // アプリケーションインスタンスへの参照
        
        // ドラッグ関連の状態
        this.isDragging = false;
        this.draggingMarker = null;
        this.draggingPointId = null;
        
        this.initEventHandlers();
    }

    // アプリケーションインスタンスを設定
    setAppInstance(appInstance) {
        this.appInstance = appInstance;
    }

    // イベントハンドラーを初期化
    initEventHandlers() {
        // 地図クリックでポイント追加モード時の処理
        this.mapManager.onMapClick(async (e) => {
            if (this.isAddingPoint) {
                await this.addPointAtLocation(e.latlng);
                this.setAddingMode(false);
            }
        });

        // 地図全体でのマウスイベント（ドラッグ用）
        const map = this.mapManager.getMap();
        map.on('mousemove', (e) => {
            if (this.isDragging && this.draggingMarker && this.draggingPointId === this.selectedPointId) {
                this.draggingMarker.setLatLng(e.latlng);
                // ドラッグ中にリアルタイムで座標情報を更新
                this.updateCoordinateFieldsRealtime(e.latlng.lat, e.latlng.lng);
            } else if (this.isAddingPoint) {
                // 追加モード中：マウス位置が既存ポイントに近いかチェック
                this.checkNearbyPointForCursor(e.latlng);
            }
        });

        map.on('mouseup', (e) => {
            if (this.isDragging && this.draggingMarker) {
                this.stopDragging();
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
        // 区分に応じたマーカー色を取得
        const markerColor = this.getMarkerColorByType(point.type);

        const marker = L.circleMarker([point.lat, point.lng], {
            radius: CONFIG.POINT_MARKER_RADIUS,
            fillColor: markerColor,
            color: markerColor,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6,
            draggable: false
        }).addTo(this.mapManager.getMap());

        // マーカークリックイベント
        marker.on('click', (e) => {
            if (this.isMovingPoint && this.selectedPointId !== point.id) {
                // 移動モードで他のポイントをクリックした場合、移動モードを解除
                this.setMovingMode(false);
                if (this.appInstance && this.appInstance.resetMoveButtonColor) {
                    this.appInstance.resetMoveButtonColor();
                }
            }
            this.selectPoint(point.id);
            e.originalEvent.stopPropagation();
        });

        // 手動ドラッグ機能を実装
        marker.on('mousedown', (e) => {
            if (this.isMovingPoint && this.selectedPointId === point.id) {
                this.startDragging(marker, point.id, e);
                e.originalEvent.stopPropagation();
                e.originalEvent.preventDefault();
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
    async addPointAtLocation(latlng) {
        // 既存ポイントとの重複チェック（ピクセル距離基準）
        if (this.hasPointNearLocation(latlng.lat, latlng.lng)) {
            if (this.appInstance && this.appInstance.showMessage) {
                this.appInstance.showMessage('この地点には既にポイントが存在します。同じ地点には追加できません。', 'warning');
            } else {
                this.showMessage('この地点には既にポイントが存在します。同じ地点には追加できません。');
            }

            // 追加ボタンの色をリセット
            if (this.appInstance && this.appInstance.resetAddButtonColor) {
                this.appInstance.resetAddButtonColor();
            }

            return;
        }

        const point = this.gpsDataManager.addPoint(latlng.lat, latlng.lng);
        this.addMarkerForPoint(point);
        await this.selectPoint(point.id, true); // 新しいポイントフラグをtrueにする
        this.updatePointCountDisplay();
        this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_ADDED, {id: point.id}));

        // 標高をAPIから取得
        await this.ensureElevationIfNeeded(point);

        // 追加ボタンの色をリセット
        if (this.appInstance && this.appInstance.resetAddButtonColor) {
            this.appInstance.resetAddButtonColor();
        }

        // すべての処理が完了してからポイントIDフィールドをフォーカス・全選択
        setTimeout(() => {
            const pointIdField = document.getElementById('pointIdField');
            if (pointIdField && point.id.match(/^仮\d{2}$/)) {
                pointIdField.focus();
                pointIdField.select();

                // さらに確実にするため、setSelectionRangeも併用
                setTimeout(() => {
                    pointIdField.setSelectionRange(0, pointIdField.value.length);
                }, 10);
            }
        }, 100);
    }

    // ポイントを選択
    async selectPoint(pointId, isNewPoint = false) {
        // 前回選択されたマーカーの色をリセット
        if (this.selectedMarker && this.selectedPointId) {
            const prevPoint = this.gpsDataManager.getPointById(this.selectedPointId);
            if (prevPoint) {
                const prevColor = this.getMarkerColorByType(prevPoint.type);
                this.selectedMarker.setStyle({
                    fillColor: prevColor,
                    color: prevColor,
                    weight: 2,  // 通常の線の太さに戻す
                    fillOpacity: 0.6  // 通常の不透明度に戻す
                });
            }
        }

        // 新しいマーカーを選択
        const marker = this.markers.get(pointId);
        if (marker) {
            const point = this.gpsDataManager.getPointById(pointId);
            if (point) {
                // 区分に応じた色を取得して、少し明るくする（選択状態を視覚的に示す）
                const baseColor = this.getMarkerColorByType(point.type);
                const selectedColor = this.getLighterColor(baseColor);

                marker.setStyle({
                    fillColor: selectedColor,
                    color: selectedColor,
                    weight: 3,  // 線を太くして選択状態を強調
                    fillOpacity: 0.9  // 不透明度を上げて選択状態を強調
                });
            }

            this.selectedMarker = marker;
            this.selectedPointId = pointId;

            // ポイント情報を表示
            const selectedPoint = this.gpsDataManager.getPointById(pointId);
            if (selectedPoint) {
                this.updatePointInfoDisplay(selectedPoint, isNewPoint);

                // 標高が正の値でない場合は経度・緯度から標高を取得
                await this.ensureElevationIfNeeded(selectedPoint);
            }
        }
    }

    // 標高が正の値でない場合に経度・緯度から標高を取得
    async ensureElevationIfNeeded(point) {
        try {
            const updatedElevation = await this.gpsDataManager.ensureValidElevation(point.id);
            
            // 表示を更新
            if (this.selectedPointId === point.id) {
                document.getElementById('elevationField').value = updatedElevation;
            }
        } catch (error) {
            console.warn('標高取得中にエラーが発生しました:', error);
        }
    }

    // ドラッグ後の標高取得・更新（強制的に再取得）
    async fetchAndUpdateElevationAfterDrag(pointId, lat, lng) {
        try {
            const elevation = await ElevationAPI.fetchElevation(lat, lng);
            
            if (elevation !== null) {
                // 標高を更新
                const updates = { elevation: String(elevation) };
                this.gpsDataManager.updatePoint(pointId, updates);
                
                // 表示も更新（選択されているポイントの場合のみ）
                if (this.selectedPointId === pointId) {
                    document.getElementById('elevationField').value = elevation;
                }
            }
        } catch (error) {
            console.warn('ドラッグ後の標高取得中にエラーが発生しました:', error);
        }
    }

    // ポイントの位置を更新
    updatePointPosition(pointId, lat, lng) {
        const point = this.gpsDataManager.updatePoint(pointId, { lat, lng });
        if (point) {
            this.updatePointInfoDisplay(point);
            this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_MOVED, {id: pointId}));
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

        // メッセージ用にポイントIDを保存
        const deletedPointId = this.selectedPointId;

        // 選択状態をクリア
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.clearPointInfoDisplay();

        this.updatePointCountDisplay();
        this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_DELETED, {id: deletedPointId}));
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

    // 追加モード中にマウス位置の近くに既存ポイントがあるかチェック
    checkNearbyPointForCursor(latlng) {
        const hasNearbyPoint = this.hasPointNearLocation(latlng.lat, latlng.lng);

        // カーソル形状を変更
        if (hasNearbyPoint) {
            document.body.style.cursor = 'not-allowed';
        } else {
            document.body.style.cursor = 'crosshair';
        }
    }

    // 指定位置の近くに既存ポイントがあるかチェック（ピクセル距離基準）
    hasPointNearLocation(lat, lng) {
        const map = this.mapManager.getMap();
        const clickPoint = map.latLngToLayerPoint(L.latLng(lat, lng));
        const threshold = CONFIG.POINT_MARKER_RADIUS + 5; // マーカー半径 + 5ピクセルの余裕

        for (const marker of this.markers.values()) {
            const markerLatLng = marker.getLatLng();
            const markerPoint = map.latLngToLayerPoint(markerLatLng);
            const distance = clickPoint.distanceTo(markerPoint);

            if (distance <= threshold) {
                return true;
            }
        }

        return false;
    }

    // ポイント追加モードの設定
    setAddingMode(enabled) {
        this.isAddingPoint = enabled;
        document.body.style.cursor = enabled ? 'crosshair' : 'default';
    }

    // ポイント移動モードの設定
    setMovingMode(enabled) {
        this.isMovingPoint = enabled;
        
        // 選択されたマーカーのみドラッグ可能状態を更新
        if (enabled && this.selectedMarker) {
            // 選択されたマーカーをドラッグ可能にする
            this.selectedMarker.options.draggable = true;
            if (this.selectedMarker.dragging) {
                this.selectedMarker.dragging.enable();
            }
        } else if (!enabled) {
            // すべてのマーカーのドラッグを無効にする
            this.markers.forEach(marker => {
                marker.options.draggable = false;
                if (marker.dragging) {
                    marker.dragging.disable();
                }
            });
        }
        
        document.body.style.cursor = enabled ? 'move' : 'default';
    }

    // ポイント情報表示を更新
    updatePointInfoDisplay(point, isNewPoint = false) {
        const pointIdField = document.getElementById('pointIdField');
        pointIdField.value = point.id;
        document.getElementById('pointTypeSelect').value = point.type || 'ポイント'; // デフォルト: ポイント
        document.getElementById('latDecimalField').value = point.lat.toFixed(5);
        document.getElementById('lngDecimalField').value = point.lng.toFixed(5);
        document.getElementById('dmsField').value =
            this.formatDMSCoordinates(point.lng, point.lat);
        document.getElementById('elevationField').value = point.elevation;
        document.getElementById('locationField').value = point.location;
        document.getElementById('remarksField').value = point.remarks || '';

    }

    // ドラッグ中のリアルタイム座標更新（緯度・経度・DMSのみ）
    updateCoordinateFieldsRealtime(lat, lng) {
        document.getElementById('latDecimalField').value = lat.toFixed(5);
        document.getElementById('lngDecimalField').value = lng.toFixed(5);
        document.getElementById('dmsField').value = this.formatDMSCoordinates(lng, lat);
    }

    // ポイント情報表示をクリア
    clearPointInfoDisplay() {
        document.getElementById('pointTypeSelect').value = ''; // 空白に設定
        document.getElementById('pointIdField').value = '';
        document.getElementById('latDecimalField').value = '';
        document.getElementById('lngDecimalField').value = '';
        document.getElementById('dmsField').value = '';
        document.getElementById('elevationField').value = '';
        document.getElementById('locationField').value = '';
        document.getElementById('remarksField').value = '';
    }

    // 選択中のポイントを解除
    clearSelection() {
        // 前回選択されたマーカーの色をリセット
        if (this.selectedMarker && this.selectedPointId) {
            const point = this.gpsDataManager.getPointById(this.selectedPointId);
            if (point) {
                const markerColor = this.getMarkerColorByType(point.type);
                this.selectedMarker.setStyle({
                    fillColor: markerColor,
                    color: markerColor,
                    weight: 2,  // 通常の線の太さに戻す
                    fillOpacity: 0.6  // 通常の不透明度に戻す
                });
            }
        }

        this.selectedMarker = null;
        this.selectedPointId = null;
        this.clearPointInfoDisplay();
    }

    // ポイント数表示を更新
    updatePointCountDisplay() {
        const count = this.gpsDataManager.getPointCount();
        document.getElementById('pointCountField').value = count;
    }

    // 選択されたポイントの情報を更新
    updateSelectedPointInfo() {
        if (!this.selectedPointId) return;

        const currentPoint = this.gpsDataManager.getPointById(this.selectedPointId);
        const oldType = currentPoint?.type;
        const newType = document.getElementById('pointTypeSelect').value;

        const updates = {
            type: newType,
            id: document.getElementById('pointIdField').value,
            elevation: document.getElementById('elevationField').value,
            location: document.getElementById('locationField').value,
            remarks: document.getElementById('remarksField').value
        };

        // 区分が変更された場合、IDを自動生成
        if (newType !== oldType) {
            const newId = this.gpsDataManager.generateIdByType(newType || 'ポイント');
            updates.id = newId;

            // UIのポイントIDフィールドも更新
            document.getElementById('pointIdField').value = newId;
        }

        this.gpsDataManager.updatePoint(this.selectedPointId, updates);

        // 区分が変更された場合、マーカーの色を更新
        if (newType !== oldType && this.selectedMarker) {
            const newColor = this.getMarkerColorByType(newType);
            const selectedColor = this.getLighterColor(newColor);
            this.selectedMarker.setStyle({
                fillColor: selectedColor,
                color: selectedColor,
                weight: 3,
                fillOpacity: 0.9
            });
        }

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

    // ドラッグ開始
    startDragging(marker, pointId, e) {
        this.isDragging = true;
        this.draggingMarker = marker;
        this.draggingPointId = pointId;
        this.mapManager.getMap().dragging.disable();
        document.body.style.cursor = 'grabbing';
    }
    
    // ドラッグ終了
    async stopDragging() {
        if (this.isDragging && this.draggingMarker && this.draggingPointId) {
            const newLatLng = this.draggingMarker.getLatLng();
            this.updatePointPosition(this.draggingPointId, newLatLng.lat, newLatLng.lng);
            
            // GPS標高を再取得して更新
            await this.fetchAndUpdateElevationAfterDrag(this.draggingPointId, newLatLng.lat, newLatLng.lng);
            
            // 状態をリセット
            this.isDragging = false;
            this.draggingMarker = null;
            this.draggingPointId = null;
            this.mapManager.getMap().dragging.enable();
            
            // 移動モードを解除
            this.setMovingMode(false);
            if (this.appInstance && this.appInstance.resetMoveButtonColor) {
                this.appInstance.resetMoveButtonColor();
            }
            
            document.body.style.cursor = 'default';
        }
    }

    // 区分に応じたマーカー色を取得
    getMarkerColorByType(type) {
        if (!type || type === 'ポイント' || type === '') {
            return CONFIG.MARKER_COLORS.default;
        }
        return CONFIG.MARKER_COLORS[type] || CONFIG.MARKER_COLORS.default;
    }

    // 色を明るくする（選択状態の視覚的フィードバック用）
    getLighterColor(hexColor) {
        // #RRGGBBの形式をRGB値に変換
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // 各成分を30%明るくする（255に近づける）
        const lighterR = Math.min(255, Math.floor(r + (255 - r) * 0.3));
        const lighterG = Math.min(255, Math.floor(g + (255 - g) * 0.3));
        const lighterB = Math.min(255, Math.floor(b + (255 - b) * 0.3));

        // 16進数に戻す
        return `#${lighterR.toString(16).padStart(2, '0')}${lighterG.toString(16).padStart(2, '0')}${lighterB.toString(16).padStart(2, '0')}`;
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