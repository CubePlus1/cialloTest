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
    promptTemplate: '你是一个金牌政治与历史学科提分教练。请针对以下单项选择题，结合解析，给出通俗易懂、直击考点的深度解析。分析为什么正确选项是正确的，以及其他干扰项的错误原因。\n\n【题目】：\n{{title}}\n\n【选项】：\n{{options}}\n\n【正确答案】：\n{{answer}}\n\n请直接输出解析，排版优美，分段清晰，使用 Markdown 格式。',
    shortAnswerPromptTemplate: '你是一个金牌提分教练。请针对以下简答题，对比分析用户的作答和标准答案的区别，进行智能判定和批改。\n\n【题目】：\n{{title}}\n\n【标准答案】：\n{{referenceAnswer}}\n\n【用户答案】：\n{{userAnswer}}\n\n请从以下几个维度进行判定和批改：\n1. **核心要点对比**：分析用户答案是否覆盖了标准答案的核心得分点，有哪些遗漏或偏差。\n2. **准确度评价**：评估用户表述的专业性与准确度。\n3. **综合得分与建议**：给出百分制评分或等级评价，并给出具体的改进建议。\n\n请直接输出批改和判定结果，排版优美，分段清晰，使用 Markdown 格式。'
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
} else {
    // 确保包含简答题判定提示词模版
    let changed = false;
    if (config.shortAnswerPromptTemplate === undefined) {
        config.shortAnswerPromptTemplate = DEFAULT_CONFIG.shortAnswerPromptTemplate;
        changed = true;
    }
    if (changed) {
        writeJsonFileSync(CONFIG_PATH, config);
    }
}

// 默认数据库模版
const DEFAULT_DB = {
    questions: [],      // 导入的题目库
    userRecords: {},    // 用户答题记录 { qId: { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' } }
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
            const course = url.searchParams.get('course') || 'all';

            let filteredQuestions = db.questions;
            if (course !== 'all') {
                filteredQuestions = db.questions.filter(q => (q.course || '未分类') === course);
            }

            const total = filteredQuestions.length;
            const questionIds = new Set(filteredQuestions.map(q => q.id));
            
            let wrongCount = 0;
            let correctTotal = 0;
            let answeredTotal = 0;

            Object.entries(db.userRecords).forEach(([qId, rec]) => {
                if (questionIds.has(qId)) {
                    if (rec.isWrong) wrongCount++;
                    if (rec.correctCount > 0 || rec.wrongCount > 0) answeredTotal++;
                    correctTotal += rec.correctCount;
                }
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
    // 参数：mode = all (全部), wrong (仅错题), course = 科目 (可选)
    if (req.method === 'GET' && url.pathname === '/api/questions') {
        try {
            const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
            const mode = url.searchParams.get('mode') || 'all';
            const course = url.searchParams.get('course') || 'all';
            
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

            // 过滤科目
            if (course !== 'all') {
                resultList = resultList.filter(q => (q.course || '未分类') === course);
            }

            // 在题目中混入用户的作答记录与 AI 解析缓存，方便前端展现
            const mixedList = resultList.map(q => {
                const rec = db.userRecords[q.id] || { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' };
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
                
                // 自动兼容 database.json 导出的完整数据库格式 (即包含 questions 数组 of JSON 对象)
                if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray(list.questions)) {
                    list = list.questions;
                }

                if (!Array.isArray(list)) {
                    sendError(res, 400, '无效的题库格式，必须为 JSON 数组，或包含 questions 数组的 JSON 对象');
                    return;
                }

                // 过滤：导入单选题 (选项多于 1 个且 answer 长度为 1) 与 简答题
                const validList = list.filter(q => {
                    const isSingle = q.type && q.type.includes('单选');
                    const hasChoices = q.options && Object.keys(q.options).length > 0;
                    const isShort = q.type && q.type.includes('简答');
                    return isSingle || hasChoices || isShort || (!q.options && q.title);
                });

                if (validList.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, imported: 0, message: '未在文件中检测到符合条件的题目！' }));
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                let newCount = 0;

                validList.forEach(q => {
                    // 按题干去重防重复导入
                    const normalizedTitle = q.title.trim().replace(/\s+/g, '').toLowerCase();
                    const exists = db.questions.some(item => item.title.trim().replace(/\s+/g, '').toLowerCase() === normalizedTitle);
                    
                    if (!exists) {
                        const isShort = (q.type && q.type.includes('简答')) || (!q.options);
                        // 统一 ID 格式并导入
                        db.questions.push({
                            id: q.id || Math.random().toString(36).substring(2, 10),
                            type: q.type || (isShort ? '简答题' : '单选题'),
                            title: q.title,
                            options: q.options || null,
                            answer: q.answer || q.referenceAnswer || '',
                            course: q.course || '未分类'
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
                if (!id || selectedAnswer === undefined) {
                    sendError(res, 400, '缺少必要参数');
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                const question = db.questions.find(q => q.id === id);
                if (!question) {
                    sendError(res, 404, '未找到该题目');
                    return;
                }

                const isShort = question.type && question.type.includes('简答');
                let isCorrect = false;

                if (isShort) {
                    // 简答题不自动判定正确或错误，我们只保存作答，默认标记为 wrong 供学习，或者让用户手动判定
                    isCorrect = false;
                } else {
                    // 比较答案 (忽略大小写)
                    isCorrect = question.answer.trim().toUpperCase() === selectedAnswer.trim().toUpperCase();
                }

                // 更新用户答题记录
                if (!db.userRecords[id]) {
                    db.userRecords[id] = { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' };
                }

                const rec = db.userRecords[id];
                rec.lastAnswer = selectedAnswer;

                if (isShort) {
                    rec.wrongCount++;
                    rec.isWrong = true; // 默认放入错题本，等待掌握
                } else {
                    if (isCorrect) {
                        rec.correctCount++;
                        rec.isWrong = false; // 如果做对了，自动从错题本移出
                    } else {
                        rec.wrongCount++;
                        rec.isWrong = true;  // 做错，标记为错题
                    }
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

    // 5.1 获取科目列表 (GET /api/courses)
    if (req.method === 'GET' && url.pathname === '/api/courses') {
        try {
            const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
            const coursesMap = {};
            db.questions.forEach(q => {
                const c = q.course || '未分类';
                coursesMap[c] = (coursesMap[c] || 0) + 1;
            });
            const courses = Object.keys(coursesMap).map(name => ({
                name,
                count: coursesMap[name]
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(courses));
        } catch (e) {
            sendError(res, 500, e.message);
        }
        return;
    }

    // 5.2 标记掌握状态 (POST /api/mark-mastery)
    if (req.method === 'POST' && url.pathname === '/api/mark-mastery') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const cleanBody = body.replace(/^\uFEFF/, '').trim();
                const { id, isMastered } = JSON.parse(cleanBody);
                if (!id) {
                    sendError(res, 400, '缺少必要参数');
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                if (!db.userRecords[id]) {
                    db.userRecords[id] = { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' };
                }

                const rec = db.userRecords[id];
                if (isMastered) {
                    rec.isWrong = false;
                    rec.correctCount++;
                } else {
                    rec.isWrong = true;
                    rec.wrongCount++;
                }

                writeJsonFileSync(DB_PATH, db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, record: rec }));
            } catch (e) {
                sendError(res, 500, e.message);
            }
        });
        return;
    }

    // 5.3 AI 判定简答题并进行本地缓存 (POST /api/ai-grade)
    if (req.method === 'POST' && url.pathname === '/api/ai-grade') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const cleanBody = body.replace(/^\uFEFF/, '').trim();
                const { id, userAnswer } = JSON.parse(cleanBody);
                if (!id || userAnswer === undefined) {
                    sendError(res, 400, '缺少必要参数');
                    return;
                }

                const db = readJsonFileSync(DB_PATH, DEFAULT_DB);
                const question = db.questions.find(q => q.id === id);
                if (!question) {
                    sendError(res, 404, '未找到题目');
                    return;
                }

                // 优先检查本地数据库是否已经存在完全相同的回答的 AI 判定缓存
                const rec = db.userRecords[id] || { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' };
                if (rec.lastAnswer === userAnswer && rec.aiGrade) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, grade: rec.aiGrade, cached: true }));
                    return;
                }

                // 读取接口配置
                const config = readJsonFileSync(CONFIG_PATH, DEFAULT_CONFIG);
                if (!config.apiKey) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: '请先在系统设置中配置有效的 API Key 密钥！' }));
                    return;
                }

                const systemPrompt = "你是一个智能教学助教，专注于判定用户答案和标准答案的差异并进行打分批改。";
                const userPrompt = (config.shortAnswerPromptTemplate || DEFAULT_CONFIG.shortAnswerPromptTemplate)
                    .replace('{{title}}', question.title)
                    .replace('{{referenceAnswer}}', question.answer)
                    .replace('{{userAnswer}}', userAnswer);

                console.log(`[AI 判定] 正在请求 AI 判定简答题: "${question.title.slice(0, 15)}..."`);

                // 调用兼容 OpenAI 格式的 fetch 接口
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
                    db.userRecords[id] = { correctCount: 0, wrongCount: 0, lastAnswer: '', isWrong: false, aiExplanation: '', aiGrade: '' };
                }
                db.userRecords[id].lastAnswer = userAnswer;
                db.userRecords[id].aiGrade = aiResult;
                writeJsonFileSync(DB_PATH, db);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, grade: aiResult, cached: false }));

            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: `AI 判定发生致命异常: ${e.message}` }));
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
