/**
 * ファイル操作を管理するクラス
 */
export class FileHandler {
    constructor() {
        this.currentFileHandle = null;
        this.currentFileName = '';
    }

    /**
     * Excelファイルを選択・読み込み
     * @returns {Promise<{file: File, fileName: string}>} 読み込み結果
     */
    async selectExcelFile() {
        try {
            if ('showOpenFilePicker' in window) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Excel Files',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                        }
                    }],
                    multiple: false
                });
                
                this.currentFileHandle = fileHandle;
                const file = await fileHandle.getFile();
                
                if (!this.isExcelFile(file)) {
                    throw new Error('Excelファイル(.xlsx)を選択してください');
                }
                
                this.currentFileName = file.name.replace(/\.xlsx$/i, '');
                
                return { file, fileName: this.currentFileName };
            } else {
                throw new Error('File System Access API not supported');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('ファイル選択がキャンセルされました');
            }
            throw error;
        }
    }

    /**
     * 従来のinput要素からファイルを読み込み
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<{file: File, fileName: string}>} 読み込み結果
     */
    async loadFromInputFile(file) {
        if (this.isExcelFile(file)) {
            this.currentFileName = file.name.replace(/\.xlsx$/i, '');
            return { file, fileName: this.currentFileName };
        } else {
            throw new Error('サポートされたファイル形式(.xlsx)を選択してください');
        }
    }

    /**
     * Excelファイルを読み込み・解析
     * @param {File} file - Excelファイル
     * @returns {Promise<Object>} Excel データ
     */
    async loadExcelFile(file) {
        if (!this.isExcelFile(file)) {
            throw new Error('Excelファイル(.xlsx)を選択してください');
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
                }
            };
            
            reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 現在のファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentFileName() {
        return this.currentFileName;
    }
    
    /**
     * 現在の日付をyyyymmdd形式で取得
     * @returns {string} yyyymmdd形式の日付
     */
    getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    
    /**
     * デフォルトファイル名を生成
     * @returns {string} ポイントGPS-yyyymmdd
     */
    getDefaultFileName() {
        return `ポイントGPS-${this.getTodayString()}`;
    }

    /**
     * Excelファイルかどうかを判定
     * @param {File} file - ファイル
     * @returns {boolean} Excelファイルかどうか
     */
    isExcelFile(file) {
        return file.name.toLowerCase().endsWith('.xlsx') && 
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }


    /**
     * Excelデータをファイルとしてダウンロード
     * @param {Array} data - Excelデータ配列
     * @param {string} filename - ファイル名
     */
    downloadExcel(data, filename) {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'GPS_Points');
        
        const finalFilename = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
        XLSX.writeFile(workbook, finalFilename);
    }

    /**
     * ユーザーが場所を指定してExcelファイルを保存
     * @param {Array} data - Excelデータ配列
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<{success: boolean, filename?: string, error?: string}>} 保存結果
     */
    async saveExcelWithUserChoice(data, defaultFilename) {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'GPS_Points');
        
        const excelData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelData], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        try {
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename.endsWith('.xlsx') ? defaultFilename : defaultFilename + '.xlsx',
                    types: [{
                        description: 'Excel Files',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                        }
                    }]
                };
                
                if (this.currentFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                    } catch (error) {
                        // 同じディレクトリの取得に失敗、デフォルトディレクトリを使用
                    }
                }
                
                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                return { success: true, filename: fileHandle.name };
            } else {
                this.downloadExcel(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'キャンセル' };
            }
            
            try {
                this.downloadExcel(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            } catch (downloadError) {
                return { success: false, error: error.message };
            }
        }
    }
}