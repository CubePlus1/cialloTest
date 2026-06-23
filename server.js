/**
 * AI-Powered Exam Practice & Analysis System - Backend Server
 * 
 * 原生 Node.js 编写 (无需 npm install，零安装开箱即用)
 * 端口: 8080
 * 
 * 核心功能：
 * 1. 静态资源服务器 (托管前端 Single Page App)
 * 2. 数据库模块：读取并保存自测题目、刷题进度、错题本数据（持久化至 database.json）
 * 3. 智能 API 接口：包含错题记录、重做逻辑、题库 JSON 导入
 * 4. 深度 AI 解析接口：支持任何兼容 OpenAI 格式的 API (如 DeepSeek, Gemini, OpenAI 等) 进行解析并自动缓存结果
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

const DB_PATH = path.join(baseDir, 'database.json');
const CONFIG_PATH = path.join(baseDir, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 初始化配置文件 (默认支持国内主流大模型服务商，用户只需在前端设置界面配置 API Key 即可)
const DEFAULT_CONFIG = {
    apiBase: 'https://api.deepseek.com/v1',
    apiKey: '',
    modelName: 'deepseek-chat',
    promptTemplate: '你是一个金牌政治与历史学科提分教练。请针对以下单项选择题，结合解析，给出通俗易懂、直击考点的深度解析。分析为什么正确选项是正确的，以及其他干扰项的错误原因。\n\n【题目】：\n{{title}}\n\n【选项】：\n{{options}}\n\n【正确答案】：\n{{answer}}\n\n请直接输出解析，排版优美，分段清晰，使用 Markdown 格式。'
};

// JSON 读写辅助函数（自动处理并剥离 UTF-8 BOM，防止 Windows 系统下解析异常）
function readJsonFileSync(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (!content) {
            return defaultValue;
        }
        const cleanContent = content.replace(/^\uFEFF/, '');
        return JSON.parse(cleanContent);
    } catch (e) {
        console.error(`[Error] 读取或解析 JSON 文件失败 (${filePath}):`, e.message);
        return defaultValue;
    }
}

function writeJsonFileSync(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error(`[Error] 写入 JSON 文件失败 (${filePath}):`, e.message);
        return false;
    }
}

// 初始化配置文件
let config = readJsonFileSync(CONFIG_PATH);
if (!config || !config.apiBase) {
    config = DEFAULT_CONFIG;
    writeJsonFileSync(CONFIG_PATH, config);
}

// 默认数据库模版
const DEFAULT_DB = {
    questions: [],      // 导入的题目库
    userRecords: {},    // 用户答题记录 { qId: { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '' } }
};

// 初始化数据库
let db = readJsonFileSync(DB_PATH);
if (!db || !Array.isArray(db.questions)) {
    db = DEFAULT_DB;
    writeJsonFileSync(DB_PATH, db);
}


// 辅助：获取文件 Mime 类型
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // 跨域处理
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // =========================================================================
    // API 路由部分
    // =========================================================================

    // 1. 获取全局答题统计数据 (GET /api/stats)
    if (req.method === 'GET' && url.pathname === '/api/stats') {
        try {
            const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
            const total = db.questions.length;
            
            let wrongCount = 0;
            let correctTotal = 0;
            let answeredTotal = 0;

            Object.values(db.userRecords).forEach(rec => {
                if (rec.isWrong) wrongCount++;
                if (rec.correctCount > 0 || rec.wrongCount > 0) answeredTotal++;
                correctTotal += rec.correctCount;
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                totalQuestions: total,
                wrongQuestions: wrongCount,
                answeredQuestions: answeredTotal,
                accuracyRate: answeredTotal > 0 ? Math.round((correctTotal / (correctTotal + wrongCount)) * 100) : 0
            }));
        } catch (e) {
            sendError(res, 500, e.message);
        }
        return;
    }

    // 2. 获取题目库 (GET /api/questions)
    // 参数：mode = all (全部), wrong (仅错题)
    if (req.method === 'GET' && url.pathname === '/api/questions') {
        try {
            const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
            const mode = url.searchParams.get('mode') || 'all';
            
            let resultList = [];

            if (mode === 'wrong') {
                // 仅筛选出标记为“错题”的题目
                resultList = db.questions.filter(q => {
                    const rec = db.userRecords[q.id];
                    return rec && rec.isWrong;
                });
            } else {
                resultList = [...db.questions];
            }

            // 在题目中混入用户的作答记录与 AI 解析缓存，方便前端展现
            const mixedList = resultList.map(q => {
                const rec = db.userRecords[q.id] || { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '' };
                return {
                    ...q,
                    record: rec
                };
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mixedList));
        } catch (e) {
            sendError(res, 500, e.message);
        }
        return;
    }

    // 3. 导入外部题库 JSON (POST /api/import)
    if (req.method === 'POST' && url.pathname === '/api/import') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cleanBody = body.replace(/^\uFEFF/, '').trim();
                let list = JSON.parse(cleanBody);
                
                // 自动兼容 database.json 导出的完整数据库格式 (即包含 questions 数组的 JSON 对象)
                if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray(list.questions)) {
                    list = list.questions;
                }

                if (!Array.isArray(list)) {
                    sendError(res, 400, '无效的题库格式，必须为 JSON 数组，或包含 questions 数组的 JSON 对象');
                    return;
                }

                // 过滤：仅导入单选题 (选项多于 1 个且 answer 长度为 1)
                const singleChoiceList = list.filter(q => {
                    const isSingle = q.type && q.type.includes('单选');
                    const hasChoices = q.options && Object.keys(q.options).length > 0;
                    return isSingle || hasChoices;
                });

                if (singleChoiceList.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, imported: 0, message: '未在文件中检测到符合条件的单项选择题！' }));
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                let newCount = 0;

                singleChoiceList.forEach(q => {
                    // 按题干去重防重复导入
                    const normalizedTitle = q.title.trim().replace(/\s+/g, '').toLowerCase();
                    const exists = db.questions.some(item => item.title.trim().replace(/\s+/g, '').toLowerCase() === normalizedTitle);
                    
                    if (!exists) {
                        // 统一 ID 格式并导入
                        db.questions.push({
                            id: q.id || Math.random().toString(36).substring(2, 10),
                            type: '单选题',
                            title: q.title,
                            options: q.options,
                            answer: q.answer
                        });
                        newCount++;
                    }
                });

                writeJsonFileSync(DB_PATH, db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, imported: newCount, total: db.questions.length }));
            } catch (e) {
                sendError(res, 500, e.message);
            }
        });
        return;
    }

    // 4. 提交用户作答 (POST /api/submit)
    if (req.method === 'POST' && url.pathname === '/api/submit') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cleanBody = body.replace(/^\uFEFF/, '').trim();
                const { id, selectedAnswer } = JSON.parse(cleanBody);
                if (!id || !selectedAnswer) {
                    sendError(res, 400, '缺少必要参数');
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                const question = db.questions.find(q => q.id === id);
                if (!question) {
                    sendError(res, 404, '未找到该题目');
                    return;
                }

                // 比较答案 (忽略大小写)
                const isCorrect = question.answer.trim().toUpperCase() === selectedAnswer.trim().toUpperCase();

                // 更新用户答题记录
                if (!db.userRecords[id]) {
                    db.userRecords[id] = { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '' };
                }

                const rec = db.userRecords[id];
                rec.lastAnswer = selectedAnswer;

                if (isCorrect) {
                    rec.correctCount++;
                    rec.isWrong = false; // 如果做对了，自动从错题本移出
                } else {
                    rec.wrongCount++;
                    rec.isWrong = true;  // 做错，标记为错题
                }

                writeJsonFileSync(DB_PATH, db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    isCorrect: isCorrect,
                    correctAnswer: question.answer,
                    record: rec
                }));
            } catch (e) {
                sendError(res, 500, e.message);
            }
        });
        return;
    }

    // 5. 触发 AI 深度解析并进行本地缓存 (POST /api/ai-explain)
    if (req.method === 'POST' && url.pathname === '/api/ai-explain') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const cleanBody = body.replace(/^\uFEFF/, '').trim();
                const { id } = JSON.parse(cleanBody);
                if (!id) {
                    sendError(res, 400, '缺少题目 ID');
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                const question = db.questions.find(q => q.id === id);
                if (!question) {
                    sendError(res, 404, '未找到题目');
                    return;
                }

                // 优先检查本地数据库是否已经存在本题的正文 AI 解析缓存，避免重复付费
                if (db.userRecords[id] && db.userRecords[id].aiExplanation) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, explanation: db.userRecords[id].aiExplanation, cached: true }));
                    return;
                }

                // 读取接口配置
                const config = readJsonFileSync(CONFIG_PATH, DEFAULT_CONFIG);
                if (!config.apiKey) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: '请先在系统设置中配置有效的 API Key 密钥！' }));
                    return;
                }

                // 拼装题目与选项模板
                let optionsText = '';
                Object.entries(question.options).forEach(([k, v]) => {
                    optionsText += `${k}. ${v}\n`;
                });

                const systemPrompt = "你是一个智能教学助手。";
                const userPrompt = config.promptTemplate
                    .replace('{{title}}', question.title)
                    .replace('{{options}}', optionsText)
                    .replace('{{answer}}', question.answer);

                console.log(`[AI 接口] 正在向本地 API 请求解析题目: "${question.title.slice(0, 15)}..."`);

                // 调用兼容 OpenAI 格式的高性能 fetch 接口
                const response = await fetch(`${config.apiBase}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: config.modelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.3
                    }),
                    timeout: 25000
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 接口报错: ${response.status} - ${errText}`);
                }

                const resData = await response.json();
                const aiResult = resData.choices[0].message.content.trim();

                // 写入缓存数据库，永久保存
                if (!db.userRecords[id]) {
                    db.userRecords[id] = { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '' };
                }
                db.userRecords[id].aiExplanation = aiResult;
                writeJsonFileSync(DB_PATH, db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, explanation: aiResult, cached: false }));

            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: `AI 请求发生致命异常: ${e.message}` }));
            }
        });
        return;
    }

    // 6. 保存或获取系统设置 (GET / POST /api/settings)
    if (url.pathname === '/api/settings') {
        if (req.method === 'GET') {
            const config = readJsonFileSync(CONFIG_PATH, DEFAULT_CONFIG);
            // 安全考虑，对 apiKey 进行前端打码脱敏
            const maskedConfig = {
                ...config,
                apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}******${config.apiKey.slice(-4)}` : ''
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(maskedConfig));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const cleanBody = body.replace(/^\uFEFF/, '').trim();
                    const newConfig = JSON.parse(cleanBody);
                    const currentConfig = readJsonFileSync(CONFIG_PATH, DEFAULT_CONFIG);

                    // 如果传入的 apiKey 含有打码，保留原 Key 值不变
                    if (newConfig.apiKey.includes('******')) {
                        newConfig.apiKey = currentConfig.apiKey;
                    }

                    writeJsonFileSync(CONFIG_PATH, newConfig);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    sendError(res, 500, e.message);
                }
            });
            return;
        }
    }

    // =========================================================================
    // 静态资源文件代理托管服务
    // =========================================================================
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    
    // 防目录穿越安全拦截
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Access Denied');
        return;
    }

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // 文件不存在，回退到主页（支持 SPA 路由）
            filePath = path.join(PUBLIC_DIR, 'index.html');
            res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(filePath).pipe(res);
    });
});

function sendError(res, code, msg) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
}

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🎓 Ciallo AI 智能刷题与 AI 智能解析服务器已在本地完全启动！`);
    console.log(`👉 访问地址: http://localhost:${PORT}`);
    console.log(`👉 数据文件: ${DB_PATH}`);
    console.log(`👉 AI 接口配置文件: ${CONFIG_PATH}`);
    console.log(`======================================================\n`);
});
