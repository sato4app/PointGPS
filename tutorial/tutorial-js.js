// ポイントGPS チュートリアル JavaScript
// scriptフォルダのファイルを動的に読み込んで表示

// DOM要素の取得
const video = document.getElementById('tutorialVideo');
const scriptSection = document.getElementById('scriptSection');

// 音声管理用の変数
let currentAudio = null;
let audioElements = new Map(); // 音声要素のキャッシュ
let paragraphs = []; // 動的に生成される段落要素

// scriptファイルを読み込む関数
async function loadScriptFile(scriptPath) {
    try {
        const response = await fetch(scriptPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        return text.trim();
    } catch (error) {
        console.error(`scriptファイルの読み込みエラー: ${scriptPath}`, error);
        return `[エラー: ${scriptPath}を読み込めませんでした]`;
    }
}

// 台本セグメントを動的に生成
async function buildScriptSections() {
    console.log('台本セグメントを生成中...');

    // タイトル以降の内容をクリア
    const title = scriptSection.querySelector('.script-title');
    scriptSection.innerHTML = '';
    scriptSection.appendChild(title);

    // 各セグメントを生成
    for (const segment of SEGMENTS_WITH_TIMESTAMPS) {
        // scriptファイルからテキストを読み込み
        const scriptText = await loadScriptFile(segment.scriptFile);

        // 段落要素を作成
        const paragraphDiv = document.createElement('div');
        paragraphDiv.className = 'script-paragraph';
        paragraphDiv.setAttribute('data-start', segment.start);
        paragraphDiv.setAttribute('data-end', segment.end);
        paragraphDiv.setAttribute('data-audio', segment.audioFile);
        paragraphDiv.setAttribute('data-index', segment.index);

        // タイムスタンプを作成
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = `${segment.startLabel} - ${segment.endLabel}`;

        // テキストノードを作成
        const textNode = document.createTextNode(scriptText);

        // 段落に追加
        paragraphDiv.appendChild(timestampSpan);
        paragraphDiv.appendChild(document.createElement('br'));
        paragraphDiv.appendChild(textNode);

        // scriptSectionに追加
        scriptSection.appendChild(paragraphDiv);
    }

    // 生成された段落を取得
    paragraphs = Array.from(document.querySelectorAll('.script-paragraph'));

    console.log(`台本セグメント生成完了: ${paragraphs.length}個`);

    // イベントリスナーを設定
    setupEventListeners();

    // 音声ファイルを事前ロード
    preloadAudioFiles();
}

// 音声要素を事前にロードしてキャッシュ
function preloadAudioFiles() {
    paragraphs.forEach((paragraph, index) => {
        const audioSrc = paragraph.getAttribute('data-audio');
        if (audioSrc) {
            const audio = new Audio(audioSrc);
            audio.preload = 'auto';
            audioElements.set(index, audio);

            // 音声再生エラーハンドリング
            audio.addEventListener('error', function() {
                console.error(`音声ファイルの読み込みエラー: ${audioSrc}`);
            });
        }
    });
    console.log('音声ファイルの事前ロード完了');
}

// 音声を再生
function playAudio(index) {
    // 現在の音声を停止
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    // 新しい音声を再生
    const audio = audioElements.get(index);
    if (audio) {
        currentAudio = audio;
        audio.currentTime = 0;

        // 音声再生をPromiseで処理
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log(`音声再生開始: segment ${index + 1}`);
                })
                .catch(error => {
                    console.error('音声再生エラー:', error);
                });
        }
    }
}

// 音声を停止
function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

// 台本の段落をハイライトし、自動スクロール
function highlightParagraph(paragraph) {
    // 全ての段落からactiveクラスを削除
    paragraphs.forEach(p => p.classList.remove('active'));

    // 指定された段落にactiveクラスを追加
    paragraph.classList.add('active');

    // 自動スクロール
    const paragraphTop = paragraph.offsetTop;
    const sectionHeight = scriptSection.clientHeight;
    const paragraphHeight = paragraph.clientHeight;

    scriptSection.scrollTo({
        top: paragraphTop - (sectionHeight / 2) + (paragraphHeight / 2),
        behavior: 'smooth'
    });
}

// イベントリスナーを設定
function setupEventListeners() {
    // 動画の再生時間に応じて台本と音声を同期
    video.addEventListener('timeupdate', function() {
        const currentTime = video.currentTime;

        paragraphs.forEach((paragraph, index) => {
            const start = parseFloat(paragraph.getAttribute('data-start'));
            const end = parseFloat(paragraph.getAttribute('data-end'));

            if (currentTime >= start && currentTime < end) {
                // まだハイライトされていない場合のみ処理
                if (!paragraph.classList.contains('active')) {
                    highlightParagraph(paragraph);
                    playAudio(index);
                }
            }
        });
    });

    // 動画の再生開始時
    video.addEventListener('play', function() {
        console.log('動画再生開始');
    });

    // 動画の一時停止時
    video.addEventListener('pause', function() {
        stopAudio();
        console.log('動画一時停止');
    });

    // 動画の再生終了時
    video.addEventListener('ended', function() {
        stopAudio();
        paragraphs.forEach(p => p.classList.remove('active'));
        console.log('動画再生終了');
    });

    // 動画のシーク時（再生位置変更時）
    video.addEventListener('seeked', function() {
        stopAudio();
        console.log('動画シーク完了');
    });

    // 段落をクリックすると、その時点から動画を再生
    paragraphs.forEach((paragraph, index) => {
        paragraph.addEventListener('click', function() {
            const start = parseFloat(this.getAttribute('data-start'));

            // 動画の再生位置を変更
            video.currentTime = start;

            // 動画を再生
            const playPromise = video.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        // 該当の段落をハイライト
                        highlightParagraph(paragraph);
                        // 音声を再生
                        playAudio(index);
                    })
                    .catch(error => {
                        console.error('動画再生エラー:', error);
                    });
            }
        });
    });
}

// ページを離れる前にリソースをクリーンアップ
window.addEventListener('beforeunload', () => {
    stopAudio();
    audioElements.clear();
});

// 初期化処理
document.addEventListener('DOMContentLoaded', async function() {
    console.log('ポイントGPS チュートリアル読み込み開始');

    // tutorial-config.jsが読み込まれているか確認
    if (typeof SEGMENTS_WITH_TIMESTAMPS === 'undefined') {
        console.error('tutorial-config.jsが読み込まれていません');
        return;
    }

    // 台本セグメントを動的に生成
    await buildScriptSections();

    console.log('ポイントGPS チュートリアル読み込み完了');
});
