// メインアプリケーション
import { MapManager } from './map-manager.js';
import { GPSDataManager } from './gps-data-manager.js';
import { PointManager } from './point-manager.js';
import { CONFIG } from './config.js';

class PointGPSApp {
    constructor() {
        this.mapManager = null;
        this.gpsDataManager = null;
        this.pointManager = null;
        
        this.init();
    }

    async init() {
        try {
            // 地図管理初期化
            this.mapManager = new MapManager('map');
            
            // GPSデータ管理初期化
            this.gpsDataManager = new GPSDataManager();
            
            // ポイント管理初期化
            this.pointManager = new PointManager(this.mapManager, this.gpsDataManager);
            
            // イベントハンドラー設定
            this.setupEventHandlers();
            
            console.log('PointGPSアプリケーションを初期化しました');
        } catch (error) {
            console.error('アプリケーション初期化エラー:', error);
            this.showError('アプリケーションの初期化中にエラーが発生しました');
        }
    }

    setupEventHandlers() {
        // GPS読み込みボタン
        const loadGpsBtn = document.getElementById('loadGpsBtn');
        const gpsCsvInput = document.getElementById('gpsCsvInput');
        
        loadGpsBtn.addEventListener('click', () => {
            gpsCsvInput.click();
        });
        
        gpsCsvInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const pointCount = await this.gpsDataManager.loadExcelFile(file);
                    this.pointManager.displayAllPoints();
                    this.showMessage(`${pointCount}個のポイントを読み込みました`);
                } catch (error) {
                    console.error('Excel読み込みエラー:', error);
                    this.showError(CONFIG.MESSAGES.EXCEL_LOAD_ERROR);
                }
            }
        });

        // ポイント操作ボタン
        document.getElementById('addPointBtn').addEventListener('click', () => {
            this.pointManager.setAddingMode(true);
            this.showMessage('地図上をクリックしてポイントを追加してください');
        });

        document.getElementById('movePointBtn').addEventListener('click', () => {
            if (this.pointManager.selectedPointId) {
                this.pointManager.setMovingMode(true);
                this.showMessage('ポイントをドラッグして移動してください');
            } else {
                this.showMessage(CONFIG.MESSAGES.NO_POINT_SELECTED);
            }
        });

        document.getElementById('deletePointBtn').addEventListener('click', () => {
            if (confirm('選択したポイントを削除しますか？')) {
                this.pointManager.deleteSelectedPoint();
            }
        });

        // 出力ボタン
        document.getElementById('exportExcelBtn').addEventListener('click', () => {
            try {
                this.gpsDataManager.exportToExcel();
                this.showMessage(CONFIG.MESSAGES.EXPORT_SUCCESS);
            } catch (error) {
                console.error('Excel出力エラー:', error);
                this.showError(CONFIG.MESSAGES.EXPORT_ERROR);
            }
        });

        document.getElementById('exportGeoJsonBtn').addEventListener('click', () => {
            try {
                this.gpsDataManager.exportToGeoJSON();
                this.showMessage(CONFIG.MESSAGES.EXPORT_SUCCESS);
            } catch (error) {
                console.error('GeoJSON出力エラー:', error);
                this.showError(CONFIG.MESSAGES.EXPORT_ERROR);
            }
        });

        // ポイント情報フィールドの変更イベント
        ['pointIdField', 'elevationField', 'gpsElevationField', 'locationField'].forEach(fieldId => {
            document.getElementById(fieldId).addEventListener('change', () => {
                this.pointManager.updateSelectedPointInfo();
            });
        });

        // ESCキーで各種モードを終了
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.pointManager.setAddingMode(false);
                this.pointManager.setMovingMode(false);
                this.showMessage('操作をキャンセルしました');
            }
        });
    }

    showMessage(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = message;
        messageArea.className = 'message-area message-info';
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, CONFIG.MESSAGE_DISPLAY_DURATION);
    }

    showError(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = message;
        messageArea.className = 'message-area message-error';
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, CONFIG.MESSAGE_DISPLAY_DURATION * 2); // エラーは少し長く表示
    }
}

// DOMContentLoaded後にアプリケーションを開始
document.addEventListener('DOMContentLoaded', () => {
    new PointGPSApp();
});