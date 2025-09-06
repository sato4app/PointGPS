// アプリケーション設定定数
export const CONFIG = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,
    
    // 国土地理院タイル設定
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
    
    // ポイントマーカー設定
    POINT_MARKER_COLOR: '#008000',    // 緑(#008000) 赤色(#ff0000)
    POINT_MARKER_RADIUS: 6,
    SELECTED_POINT_COLOR: '#32cd32',  // ライムグリーン(#32cd32)  // ライム:明るい緑(#00ff00)
    
    // UI色設定
    MOVE_BUTTON_ACTIVE_COLOR: '#32cd32',  // ライムグリーン(#32cd32)
    
    // ファイルタイプ
    ACCEPTED_EXCEL_EXTENSIONS: ['.xlsx'],
    
    // UI設定
    MESSAGE_DISPLAY_DURATION: 3000, // ms
    
    // エラーメッセージ
    MESSAGES: {
        EXCEL_LOAD_SUCCESS: 'Excelファイルを正常に読み込みました',
        EXCEL_LOAD_ERROR: 'Excelファイルの読み込みに失敗しました',
        POINT_ADDED: 'ポイントを追加しました',
        POINT_MOVED: 'ポイントを移動しました',
        POINT_DELETED: 'ポイントを削除しました',
        NO_POINT_SELECTED: 'ポイントが選択されていません',
        EXPORT_SUCCESS: 'ファイルを出力しました',
        EXPORT_ERROR: 'ファイル出力に失敗しました'
    }
};