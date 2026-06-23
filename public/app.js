/**
 * 🎓 Ciallo AI 智能刷题系统 - Hyper-Premium Frontend App JS Controller
 * 
 * 核心设计原则：
 * 1. 简练可靠的状态管理 (State Management)
 * 2. 完美的平滑交互与动画衔接
 * 3. 智能 API 交互：与原生 Node.js 后端无缝通信
 * 4. 错题本重做机制：一旦消灭（答对），立刻自动移出
 * 5. 全面的异常处理与富有人性化的 UI 反馈
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. 全局状态存储 (Application State)
    // =========================================================================
    const state = {
        currentView: 'dashboard',         // 'dashboard' | 'practice' | 'wrong-notebook' | 'settings'
        questions: [],                    // 当前加载的题目数组（全量或错题）
        currentMode: 'all',               // 'all' (全部题目模式) | 'wrong' (仅错题本重做模式)
        currentCourse: 'all',             // 当前选择的科目
        currentIndex: 0,                  // 当前题目索引 (0-based)
        isSubmitted: false,               // 当前题目是否已经作答锁定
        stats: {                          // 控制面板统计指标
            total: 0,
            wrong: 0,
            answered: 0,
            accuracy: '0%'
        }
    };

    // =========================================================================
    // 2. DOM 元素缓存 (DOM Elements Cache)
    // =========================================================================
    // 侧边栏及导航
    const menuItems = document.querySelectorAll('.menu-item');
    const tabViews = document.querySelectorAll('.tab-view');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const courseSelect = document.getElementById('course-select');
    
    // 控制面板统计
    const statsTotal = document.getElementById('stats-total');
    const statsWrong = document.getElementById('stats-wrong');
    const statsAnswered = document.getElementById('stats-answered');
    const statsAccuracy = document.getElementById('stats-accuracy');
    
    // 文件导入
    const importZone = document.getElementById('import-zone');
    const fileInput = document.getElementById('file-input');
    const progressContainer = document.getElementById('import-progress-container');
    const progressFill = document.getElementById('import-progress-fill');

    // 智能刷题面板
    const quizContainer = document.querySelector('.quiz-container');
    const quizIndex = document.getElementById('quiz-index');
    const quizTotal = document.getElementById('quiz-total');
    const quizProgressFill = document.getElementById('quiz-progress-fill');
    const questionCard = document.getElementById('question-card');
    const quesType = document.getElementById('ques-type');
    const quesStatus = document.getElementById('ques-status');
    const quesTitle = document.getElementById('ques-title');
    const choicesList = document.getElementById('choices-list');

    // 简答题专门组件
    const shortAnswerContainer = document.getElementById('short-answer-container');
    const shortAnswerInput = document.getElementById('short-answer-input');
    const btnSubmitShort = document.getElementById('btn-submit-short');
    
    // 答题反馈
    const feedbackPanel = document.getElementById('feedback-panel');
    const feedbackStatus = document.getElementById('feedback-status');
    const correctAnsValue = document.getElementById('correct-ans-value');
    const choiceAnsLabel = document.getElementById('choice-ans-label');
    const shortCorrectAnsContainer = document.getElementById('short-correct-ans-container');
    const shortCorrectAnsValue = document.getElementById('short-correct-ans-value');
    const shortSelfEvalRow = document.getElementById('short-self-eval-row');
    const btnShortRetry = document.getElementById('btn-short-retry');
    const btnShortFail = document.getElementById('btn-short-fail');
    const btnShortPass = document.getElementById('btn-short-pass');
    const btnAiExplain = document.getElementById('btn-ai-explain');
    const btnNextQuestion = document.getElementById('btn-next-question');
    const btnPrevQuestionNav = document.getElementById('btn-prev-question-nav');
    const btnNextQuestionNav = document.getElementById('btn-next-question-nav');
    const jumpQuestionInput = document.getElementById('jump-question-input');
    
    // AI 解析面板
    const aiExplanationBox = document.getElementById('ai-explanation-box');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const cacheBadge = document.getElementById('cache-badge');
    const aiLoading = document.getElementById('ai-loading');
    const aiContent = document.getElementById('ai-content');

    // 错题本面板
    const wrongTotalCount = document.getElementById('wrong-total-count');
    const btnStartWrongPractice = document.getElementById('btn-start-wrong-practice');
    const wrongListContainer = document.getElementById('wrong-list-container');

    // 系统设置表单
    const settingsForm = document.getElementById('settings-form');
    const settingsApiBase = document.getElementById('settings-api-base');
    const settingsApiKey = document.getElementById('settings-api-key');
    const settingsModelName = document.getElementById('settings-model-name');
    const settingsTemplate = document.getElementById('settings-template');
    const settingsShortTemplate = document.getElementById('settings-short-template');
    const btnResetProgress = document.getElementById('btn-reset-progress');
    
    // 弹窗 Toast
    const toast = document.getElementById('toast');

    // 主题切换按钮
    const btnThemeDark = document.getElementById('btn-theme-dark');
    const btnThemeLight = document.getElementById('btn-theme-light');

    // =========================================================================
    // 2.5 主题管理器 (Theme Manager)
    // =========================================================================
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        // 更新按钮激活状态
        if (theme === 'light') {
            btnThemeDark.classList.remove('active');
            btnThemeLight.classList.add('active');
        } else {
            btnThemeLight.classList.remove('active');
            btnThemeDark.classList.add('active');
        }
    }

    btnThemeDark.addEventListener('click', () => {
        applyTheme('dark');
        showToast('已切换至暗黑极客模式 🌙', 'info');
    });

    btnThemeLight.addEventListener('click', () => {
        applyTheme('light');
        showToast('已切换至极简浅色模式 ☀️', 'info');
    });

    // 立即初始化主题
    initTheme();

    // =========================================================================
    // 3. 通用功能与辅助函数 (Helper Functions)
    // =========================================================================
    
    // 统一显示通知 (Premium OKLCH sliding Toast)
    function showToast(message, type = 'info') {
        toast.textContent = message;
        toast.style.display = 'block';
        
        // 样式微调
        if (type === 'success') {
            toast.style.borderColor = 'var(--emerald-500)';
            toast.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px var(--emerald-glow)';
        } else if (type === 'error') {
            toast.style.borderColor = 'var(--rose-500)';
            toast.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px var(--rose-glow)';
        } else {
            toast.style.borderColor = 'var(--indigo-500)';
            toast.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px var(--indigo-glow)';
        }

        setTimeout(() => toast.classList.add('show'), 50);

        // 3秒后自动淡出消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => { toast.style.display = 'none'; }, 400);
        }, 3000);
    }

    // 后端 API 通用请求封装 (支持 JSON 数据格式)
    async function request(url, method = 'GET', data = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status} - ${text}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`[API 请求错误] ${url}`, error);
            showToast(`网络交互失败: ${error.message}`, 'error');
            throw error;
        }
    }

    // 加载全局统计指标并刷新控制面板
    async function loadGlobalStats() {
        try {
            const data = await request(`/api/stats?course=${state.currentCourse}`);
            state.stats = {
                total: data.totalQuestions || 0,
                wrong: data.wrongQuestions || 0,
                answered: data.answeredQuestions || 0,
                accuracy: `${data.accuracyRate || 0}%`
            };

            // 渲染控制面板数字
            statsTotal.textContent = state.stats.total;
            statsWrong.textContent = state.stats.wrong;
            statsAnswered.textContent = state.stats.answered;
            statsAccuracy.textContent = state.stats.accuracy;

            // 错题本页面的顶栏指标同步
            if (wrongTotalCount) {
                wrongTotalCount.textContent = state.stats.wrong;
            }
        } catch (err) {
            console.error('统计加载失败', err);
        }
    }

    // 获取并渲染科目列表
    async function loadCourses() {
        try {
            const courses = await request('/api/courses');
            const selectedVal = courseSelect.value || 'all';
            courseSelect.innerHTML = '<option value="all">全部科目</option>';
            courses.forEach(c => {
                const option = document.createElement('option');
                option.value = c.name;
                option.textContent = `${c.name} (${c.count}道题)`;
                courseSelect.appendChild(option);
            });
            // 恢复选中项
            if (courses.some(c => c.name === selectedVal)) {
                courseSelect.value = selectedVal;
                state.currentCourse = selectedVal;
            } else {
                courseSelect.value = 'all';
                state.currentCourse = 'all';
            }
        } catch (err) {
            console.error('加载科目列表失败', err);
        }
    }

    // 科目选择变更事件
    if (courseSelect) {
        courseSelect.addEventListener('change', (e) => {
            state.currentCourse = e.target.value;
            // 切换/刷新当前视图
            if (state.currentView === 'dashboard') {
                loadGlobalStats();
            } else if (state.currentView === 'practice') {
                loadQuestions(state.currentMode);
            } else if (state.currentView === 'wrong-notebook') {
                loadWrongNotebookList();
            }
            showToast(`已切换科目为：${state.currentCourse === 'all' ? '全部科目' : state.currentCourse}`, 'info');
        });
    }

    // =========================================================================
    // 4. 侧边栏视图切换路由模块 (Router System)
    // =========================================================================
    function switchView(viewName) {
        state.currentView = viewName;
        
        // 激活状态样式切换
        menuItems.forEach(item => {
            if (item.getAttribute('data-tab') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 视图容器显示隐藏切换
        tabViews.forEach(view => {
            if (view.id === `view-${viewName}`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        // 动态更新页面标题和副标题
        updateHeaders(viewName);

        // 视口触发具体动作
        if (viewName === 'dashboard') {
            loadGlobalStats();
        } else if (viewName === 'practice') {
            // 如果是在 Practice 模式并且题目列表为空，进行初始化加载
            if (state.questions.length === 0 || state.currentMode !== 'all') {
                state.currentMode = 'all';
                loadQuestions('all');
            }
        } else if (viewName === 'wrong-notebook') {
            loadWrongNotebookList();
        } else if (viewName === 'settings') {
            loadSystemSettings();
        }
    }

    function updateHeaders(viewName) {
        const headerInfo = {
            'dashboard': {
                title: '系统控制面板',
                subtitle: '欢迎回来，开启你今日的 Ciallo AI 智能刷题之旅。'
            },
            'practice': {
                title: state.currentMode === 'wrong' ? '🎯 错题攻坚自测' : '📚 智能并发刷题',
                subtitle: state.currentMode === 'wrong' ? '专打薄弱环节！在这里，答对的题目会自动从错题本中移除。' : '精选海量题目题库，配合金牌 AI 教练全程护航。'
            },
            'wrong-notebook': {
                title: '我的错题账本',
                subtitle: '知己知彼，百战不殆。在这里总结你的所有技术盲区与复盘笔记。'
            },
            'settings': {
                title: '系统底层配置',
                subtitle: '配置安全授权 API 密钥与深度考点精细生成 Prompt 提示词模板。'
            }
        };

        const info = headerInfo[viewName];
        if (info) {
            pageTitle.textContent = info.title;
            pageSubtitle.textContent = info.subtitle;
        }
    }

    // 绑定侧边栏切换事件
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            switchView(tabName);
        });
    });

    // =========================================================================
    // 5. 题库导入模块 (File Import Module)
    // =========================================================================
    
    // 触发隐藏的文件选择器
    importZone.addEventListener('click', () => fileInput.click());

    // 拖拽悬浮特效
    importZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        importZone.classList.add('dragover');
    });

    importZone.addEventListener('dragleave', () => {
        importZone.classList.remove('dragover');
    });

    importZone.addEventListener('drop', (e) => {
        e.preventDefault();
        importZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    // 文件选择器改变事件
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });

    function handleUploadedFile(file) {
        if (!file.name.endsWith('.json')) {
            showToast('错误：只允许导入标准 JSON 格式的题库文件！', 'error');
            return;
        }

        const defaultCourseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const userSubject = prompt(`💾 请输入要导入的科目分类名称\n\n- 输入已有科目（如"软件测试"）则会在此科目下【新增/合并】题目\n- 输入新名称则会【创建新科目】\n- 留空直接按回车，默认使用文件名："${defaultCourseName}"`, defaultCourseName);
        
        if (userSubject === null) {
            // 用户取消导入
            return;
        }
        
        const finalCourseName = userSubject.trim() || defaultCourseName;

        const reader = new FileReader();
        
        // 进度显示
        progressContainer.style.display = 'block';
        progressFill.style.width = '10%';

        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 50);
                progressFill.style.width = `${10 + percent}%`;
            }
        };

        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                progressFill.style.width = '70%';

                // 将解析到的数据包发给后端导入接口，并传入用户指定的科目名
                const res = await request(`/api/import?defaultCourse=${encodeURIComponent(finalCourseName)}`, 'POST', jsonData);
                
                progressFill.style.width = '100%';
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 1000);

                if (res.success) {
                    showToast(`恭喜！成功导入 ${res.imported} 道新题目！当前题库总计数: ${res.total} 道`, 'success');
                    // 重置本地加载状态以强制重载题目
                    state.questions = [];
                    loadGlobalStats();
                    loadCourses();
                } else {
                    showToast(res.message || '导入失败，请检查文件格式是否匹配。', 'error');
                }
            } catch (err) {
                progressContainer.style.display = 'none';
                showToast(`JSON 解析失败: ${err.message}，请确保为标准的 UTF-8 JSON 格式文件。`, 'error');
            }
        };

        reader.onerror = () => {
            progressContainer.style.display = 'none';
            showToast('读取文件出错，请重试！', 'error');
        };

        reader.readAsText(file, 'utf-8');
    }

    // =========================================================================
    // 6. 智能刷题引擎核心模块 (Practice / Redo Core)
    // =========================================================================
    
    // 从后端拉取题目集并初始化刷题索引
    async function loadQuestions(mode = 'all', targetQuestionId = null) {
        try {
            const data = await request(`/api/questions?mode=${mode}&course=${state.currentCourse}`);
            state.questions = data;
            state.currentMode = mode;
            
            if (state.questions.length === 0) {
                renderEmptyPracticeState();
                return;
            }

            // 如果指定了某一道题目，则跳到对应的题目 ID 索引处（用于错题本中单独攻坚某题）
            if (targetQuestionId) {
                const findIndex = state.questions.findIndex(q => q.id === targetQuestionId);
                state.currentIndex = findIndex !== -1 ? findIndex : 0;
            } else {
                // 读取上次保存的刷题进度
                const savedIndex = localStorage.getItem(`quiz_currentIndex_${mode}_${state.currentCourse}`);
                if (savedIndex !== null) {
                    const parsedIndex = parseInt(savedIndex, 10);
                    if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < state.questions.length) {
                        state.currentIndex = parsedIndex;
                    } else {
                        state.currentIndex = 0;
                    }
                } else {
                    state.currentIndex = 0;
                }
            }

            renderQuestion();
        } catch (err) {
            console.error('拉取题库发生异常', err);
        }
    }

    // 渲染题库为空的缺省状态
    function renderEmptyPracticeState() {
        quizIndex.textContent = '0';
        quizTotal.textContent = '0';
        quizProgressFill.style.width = '0%';
        
        quesType.textContent = '缺省';
        quesStatus.style.display = 'none';
        quesTitle.textContent = state.currentMode === 'wrong' 
            ? '哇塞！你的错题本里空空如也，全部通关！赶紧去“智能刷题”中做几道测试题吧！🎉' 
            : '当前系统数据库里没有该科目的题目哦！请先在“控制面板”中导入对应的题库 JSON 文件。🎓';
            
        choicesList.innerHTML = '';
        shortAnswerContainer.style.display = 'none';
        feedbackPanel.style.display = 'none';
        aiExplanationBox.style.display = 'none';
        if (quizContainer) {
            quizContainer.classList.remove('has-sidebar');
        }
    }

    // 渲染当前题目详情卡片
    function renderQuestion() {
        const question = state.questions[state.currentIndex];
        if (!question) return;

        state.isSubmitted = false;

        // 1. 更新顶部进度条
        quizIndex.textContent = state.currentIndex + 1;
        quizTotal.textContent = state.questions.length;
        if (jumpQuestionInput) {
            jumpQuestionInput.value = state.currentIndex + 1;
            jumpQuestionInput.max = state.questions.length;
        }
        const progressPercent = Math.round(((state.currentIndex + 1) / state.questions.length) * 100);
        quizProgressFill.style.width = `${progressPercent}%`;

        // 2. 徽章和错题标记
        const typeStr = question.type || '单选题';
        quesType.textContent = typeStr;
        const isShort = typeStr.includes('简答');

        if (question.record && question.record.isWrong) {
            quesStatus.textContent = `错题重考 (答错 ${question.record.wrongCount} 次)`;
            quesStatus.className = 'badge badge-red';
            quesStatus.style.display = 'inline-block';
        } else if (state.currentMode === 'wrong') {
            quesStatus.textContent = '错题狙击';
            quesStatus.className = 'badge badge-red';
            quesStatus.style.display = 'inline-block';
        } else {
            quesStatus.style.display = 'none';
        }

        // 3. 渲染题干
        quesTitle.textContent = question.title;

        // 4. 清理并动态渲染选项
        choicesList.innerHTML = '';
        shortAnswerInput.value = '';
        feedbackPanel.style.display = 'none';
        aiExplanationBox.style.display = 'none';
        shortSelfEvalRow.style.display = 'none';
        
        if (quizContainer) {
            quizContainer.classList.remove('has-sidebar');
        }

        if (isShort) {
            choicesList.style.display = 'none';
            shortAnswerContainer.style.display = 'flex';
            shortAnswerInput.disabled = false;
            btnSubmitShort.disabled = false;
            
            // 自动填充上次填写的答案
            shortAnswerInput.value = (question.record && question.record.lastAnswer) || '';
            btnAiExplain.textContent = '🤖 AI 智能判定与对比';

            // 如果已经提交过，直接展示标准答案
            if (question.record && question.record.lastAnswer) {
                state.isSubmitted = true;
                shortAnswerInput.disabled = true;
                btnSubmitShort.disabled = true;
                showShortAnswerFeedback(question, question.answer);
            }
        } else {
            choicesList.style.display = 'block';
            shortAnswerContainer.style.display = 'none';
            btnAiExplain.textContent = '🤖 深度 AI 考点解析';

            // 选项字母映射 (A, B, C, D...)
            Object.entries(question.options).forEach(([key, value]) => {
                const choiceItem = document.createElement('div');
                choiceItem.className = 'choice-item';
                choiceItem.setAttribute('data-key', key);
                
                const marker = document.createElement('div');
                marker.className = 'choice-marker';
                marker.textContent = key.trim().toUpperCase();

                const text = document.createElement('div');
                text.className = 'choice-text';
                text.textContent = value;

                choiceItem.appendChild(marker);
                choiceItem.appendChild(text);

                // 选择并触发自动提交 (单选题一键确定)
                choiceItem.addEventListener('click', () => {
                    if (state.isSubmitted) return;
                    submitAnswer(key);
                });

                choicesList.appendChild(choiceItem);
            });
        }
    }

    // 处理选择题作答提交动作
    async function submitAnswer(selectedKey) {
        state.isSubmitted = true;
        const question = state.questions[state.currentIndex];
        
        // 锁定选项，防止用户在出结果前二次点击
        const items = choicesList.querySelectorAll('.choice-item');
        items.forEach(item => item.classList.add('disabled'));

        try {
            const res = await request('/api/submit', 'POST', {
                id: question.id,
                selectedAnswer: selectedKey
            });

            const correctAnswer = res.correctAnswer.trim().toUpperCase();
            const userChoice = selectedKey.trim().toUpperCase();

            // 高亮选项
            items.forEach(item => {
                const key = item.getAttribute('data-key').trim().toUpperCase();
                if (key === correctAnswer) {
                    item.classList.add('correct'); // 正确选项亮绿
                }
                if (key === userChoice && !res.isCorrect) {
                    item.classList.add('wrong'); // 做错的选项亮红
                }
            });

            // 弹出反馈面板
            feedbackPanel.style.display = 'block';
            feedbackPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            if (res.isCorrect) {
                feedbackStatus.textContent = '回答正确！🎉 考点拿捏！';
                feedbackStatus.style.color = 'var(--emerald-400)';
            } else {
                feedbackStatus.textContent = '回答错误 ❌ 加油复盘！';
                feedbackStatus.style.color = 'var(--rose-400)';
            }

            correctAnsValue.textContent = correctAnswer;

            // 更新本题的本地答题缓存统计，用于当前会话状态
            question.record = res.record;

            // 如果是在“错题本重做”模式下答对了，为了让用户感知成就感，本题会自动在下一题拉取时消失。
            if (state.currentMode === 'wrong' && res.isCorrect) {
                showToast('已攻克！该错题已自动从错题本中移除 ✨', 'success');
            }

        } catch (err) {
            console.error('提交失败', err);
            items.forEach(item => item.classList.remove('disabled'));
            state.isSubmitted = false;
        }
    }

    // 简答题专门的提交作答
    async function submitShortAnswer(userAnswerText) {
        state.isSubmitted = true;
        const question = state.questions[state.currentIndex];
        
        shortAnswerInput.disabled = true;
        btnSubmitShort.disabled = true;

        try {
            const res = await request('/api/submit', 'POST', {
                id: question.id,
                selectedAnswer: userAnswerText
            });

            // 更新用户答题记录
            question.record = res.record;

            showShortAnswerFeedback(question, res.correctAnswer);
        } catch (err) {
            console.error('提交简答题失败', err);
            shortAnswerInput.disabled = false;
            btnSubmitShort.disabled = false;
            state.isSubmitted = false;
        }
    }

    // 展示简答题作答反馈
    function showShortAnswerFeedback(question, referenceAnswer) {
        feedbackPanel.style.display = 'block';
        feedbackPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        choiceAnsLabel.style.display = 'none';
        shortCorrectAnsContainer.style.display = 'block';
        shortCorrectAnsValue.textContent = referenceAnswer;

        feedbackStatus.textContent = '已提交作答！可以点击“AI 智能判定与对比”判定回答差异，或直接对比后自我评定。';
        feedbackStatus.style.color = 'var(--text-primary)';

        shortSelfEvalRow.style.display = 'flex';
    }

    function nextQuestion() {
        if (state.currentIndex + 1 < state.questions.length) {
            state.currentIndex++;
            localStorage.setItem(`quiz_currentIndex_${state.currentMode}_${state.currentCourse}`, state.currentIndex);
            renderQuestion();
        } else {
            showToast('太棒了！当前题库的所有题目都已刷完！🎉', 'success');
            // 刷完后清除该模式的进度缓存，下次从第一题重新开始
            localStorage.removeItem(`quiz_currentIndex_${state.currentMode}_${state.currentCourse}`);
            state.currentIndex = 0;
            switchView('dashboard');
        }
    }

    function prevQuestion() {
        if (state.currentIndex > 0) {
            state.currentIndex--;
            localStorage.setItem(`quiz_currentIndex_${state.currentMode}_${state.currentCourse}`, state.currentIndex);
            renderQuestion();
        } else {
            showToast('已经是第一题了！', 'info');
        }
    }

    // 下一题按钮点击动作
    btnNextQuestion.addEventListener('click', () => {
        // 如果是错题本模式，用户在做对了以后，如果本题已经移除，我们重新加载剩余错题更平滑
        if (state.currentMode === 'wrong') {
            loadQuestions('wrong');
        } else {
            nextQuestion();
        }
    });

    if (btnPrevQuestionNav) {
        btnPrevQuestionNav.addEventListener('click', prevQuestion);
    }

    if (btnNextQuestionNav) {
        btnNextQuestionNav.addEventListener('click', nextQuestion);
    }

    if (jumpQuestionInput) {
        jumpQuestionInput.addEventListener('change', () => {
            const val = parseInt(jumpQuestionInput.value, 10);
            if (isNaN(val) || val < 1 || val > state.questions.length) {
                showToast(`请输入 1 到 ${state.questions.length} 之间的有效题号！`, 'error');
                jumpQuestionInput.value = state.currentIndex + 1;
                return;
            }
            state.currentIndex = val - 1;
            localStorage.setItem(`quiz_currentIndex_${state.currentMode}_${state.currentCourse}`, state.currentIndex);
            renderQuestion();
        });
    }

    // =========================================================================
    // 7. 深度 AI 考点解析模块 (DeepSeek/Gemini AI Explainer)
    // =========================================================================
    btnAiExplain.addEventListener('click', async () => {
        const question = state.questions[state.currentIndex];
        if (!question) return;

        const isShort = question.type && question.type.includes('简答');

        // 打开面板并重置
        aiExplanationBox.style.display = 'block';
        if (quizContainer) {
            quizContainer.classList.add('has-sidebar');
        }
        aiLoading.style.display = 'flex';
        aiContent.innerHTML = '';
        cacheBadge.style.display = 'none';

        // 动态修改侧边栏标题
        const sidebarTitleEl = aiExplanationBox.querySelector('.ai-sparkle');
        if (sidebarTitleEl) {
            sidebarTitleEl.textContent = isShort ? '✨ AI 智能作答批改与对比判定' : '✨ AI 智能考点深度解析';
        }

        aiExplanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        try {
            let res;
            if (isShort) {
                const userAnswer = shortAnswerInput.value.trim();
                res = await request('/api/ai-grade', 'POST', { id: question.id, userAnswer });
            } else {
                res = await request('/api/ai-explain', 'POST', { id: question.id });
            }
            
            aiLoading.style.display = 'none';
            
            if (res.success) {
                // 显示缓存标
                if (res.cached) {
                    cacheBadge.style.display = 'inline-block';
                }
                
                const contentText = isShort ? res.grade : res.explanation;
                
                // 将 Markdown 字符串渲染为富 HTML 展示
                if (window.marked) {
                    aiContent.innerHTML = marked.parse(contentText);
                } else {
                    // 退化处理
                    aiContent.innerHTML = `<pre style="white-space: pre-wrap;">${contentText}</pre>`;
                }
            } else {
                aiContent.innerHTML = `<div style="color: var(--rose-400); padding: 10px 0;">${res.error}</div>`;
            }

            aiExplanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } catch (err) {
            aiLoading.style.display = 'none';
            aiContent.innerHTML = `<div style="color: var(--rose-400); padding: 10px 0;">判定/解析请求异常: ${err.message}</div>`;
        }
    });

    // 绑定关闭解析侧边栏按钮事件
    if (btnCloseSidebar) {
        btnCloseSidebar.addEventListener('click', () => {
            aiExplanationBox.style.display = 'none';
            if (quizContainer) {
                quizContainer.classList.remove('has-sidebar');
            }
        });
    }

    // =========================================================================
    // 8. 错题账本面板模块 (Wrong Notebook Panel)
    // =========================================================================
    
    // 一键拉取错题本并进行多卡片动态渲染
    async function loadWrongNotebookList() {
        wrongListContainer.innerHTML = `
            <div style="text-align: center; padding: 48px; color: var(--text-secondary);">
                <div class="spinner" style="margin: 0 auto 16px;"></div>
                正在为您整理所有错题记录，加载中...
            </div>
        `;

        try {
            const wrongQuestions = await request(`/api/questions?mode=wrong&course=${state.currentCourse}`);
            
            // 同步顶部错题数
            statsWrong.textContent = wrongQuestions.length;
            wrongTotalCount.textContent = wrongQuestions.length;

            if (wrongQuestions.length === 0) {
                wrongListContainer.innerHTML = `
                    <div style="text-align: center; padding: 80px 24px; background-color: var(--card-bg); border-radius: 24px; border: 1px solid var(--border-color);">
                        <div style="font-size: 64px; margin-bottom: 24px;">🎉</div>
                        <h3 style="font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 600; margin-bottom: 12px;">太赞了，错题本已成功清零！</h3>
                        <p style="color: var(--text-secondary); font-size: 13.5px;">当前没有需要修补的知识盲区，继续保持，最棒的 Ciallo 就是你！</p>
                    </div>
                `;
                return;
            }

            wrongListContainer.innerHTML = '';

            wrongQuestions.forEach(q => {
                const card = document.createElement('div');
                card.className = 'wrong-card';
                card.setAttribute('data-id', q.id);

                // 题干
                const title = document.createElement('h4');
                title.className = 'wrong-card-title';
                title.innerHTML = `<span class="badge" style="background-color: var(--indigo-glow); color: var(--text-primary); font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">${q.type || '单选题'}</span>${q.title}`;
                card.appendChild(title);

                const isShort = q.type && q.type.includes('简答');

                if (isShort) {
                    // 简答题展示作答与标准答案
                    const answerBox = document.createElement('div');
                    answerBox.className = 'wrong-choices-grid';
                    answerBox.style.display = 'flex';
                    answerBox.style.flexDirection = 'column';
                    answerBox.style.gap = '8px';

                    const userAnsMini = document.createElement('div');
                    userAnsMini.className = 'wrong-choice-mini selected-wrong';
                    userAnsMini.style.whiteSpace = 'pre-wrap';
                    userAnsMini.innerHTML = `<strong>你的回答：</strong>${(q.record && q.record.lastAnswer) || '未作答'}`;

                    const correctAnsMini = document.createElement('div');
                    correctAnsMini.className = 'wrong-choice-mini correct-ans';
                    correctAnsMini.style.whiteSpace = 'pre-wrap';
                    correctAnsMini.innerHTML = `<strong>标准答案：</strong>${q.answer}`;

                    answerBox.appendChild(userAnsMini);
                    answerBox.appendChild(correctAnsMini);
                    card.appendChild(answerBox);
                } else {
                    // 选项 mini 排版
                    const choicesGrid = document.createElement('div');
                    choicesGrid.className = 'wrong-choices-grid';

                    const correctAnswer = q.answer.trim().toUpperCase();
                    const lastWrongAnswer = q.record ? q.record.lastAnswer.trim().toUpperCase() : '';

                    if (q.options) {
                        Object.entries(q.options).forEach(([key, value]) => {
                            const optionMini = document.createElement('div');
                            optionMini.className = 'wrong-choice-mini';
                            
                            const normalizedKey = key.trim().toUpperCase();
                            optionMini.textContent = `${normalizedKey}. ${value}`;

                            if (normalizedKey === correctAnswer) {
                                optionMini.classList.add('correct-ans'); // 正确亮绿
                            } else if (normalizedKey === lastWrongAnswer) {
                                optionMini.classList.add('selected-wrong'); // 之前错答高亮红
                            }

                            choicesGrid.appendChild(optionMini);
                        });
                    }
                    card.appendChild(choicesGrid);
                }

                // 错题卡片底部统计与交互操作栏
                const footer = document.createElement('div');
                footer.className = 'wrong-card-footer';

                const metaSpan = document.createElement('span');
                metaSpan.innerHTML = `累积做错: <strong style="color: var(--rose-400);">${q.record ? q.record.wrongCount : 1}</strong> 次 | 正确率: <strong style="color: var(--emerald-400);">${q.record && (q.record.correctCount + q.record.wrongCount) > 0 ? Math.round((q.record.correctCount / (q.record.correctCount + q.record.wrongCount)) * 100) : 0}%</strong>`;
                footer.appendChild(metaSpan);

                const actionDiv = document.createElement('div');
                actionDiv.style.display = 'flex';
                actionDiv.style.gap = '10px';

                // 如果本题本地已有缓存的 AI 解析/判定，提供卡片展开查看按钮
                if (q.record && (q.record.aiExplanation || q.record.aiGrade)) {
                    const btnShowAi = document.createElement('button');
                    btnShowAi.className = 'btn btn-outline';
                    btnShowAi.style.padding = '8px 16px';
                    btnShowAi.style.fontSize = '12px';
                    btnShowAi.style.borderRadius = '8px';
                    btnShowAi.textContent = isShort ? '📖 查看已存 AI 判定' : '📖 查看已存 AI 解析';
                    btnShowAi.addEventListener('click', () => toggleCardInlineAi(card, q));
                    actionDiv.appendChild(btnShowAi);
                }

                const btnRedo = document.createElement('button');
                btnRedo.className = 'btn btn-glow-red';
                btnRedo.style.padding = '8px 16px';
                btnRedo.style.fontSize = '12px';
                btnRedo.style.borderRadius = '8px';
                btnRedo.textContent = '🎯 立即攻坚消灭';
                btnRedo.addEventListener('click', () => {
                    // 转到刷题页面，拉取错题集，并跳到这道题目
                    state.currentMode = 'wrong';
                    switchView('practice');
                    loadQuestions('wrong', q.id);
                });

                actionDiv.appendChild(btnRedo);
                footer.appendChild(actionDiv);
                card.appendChild(footer);

                wrongListContainer.appendChild(card);
            });

        } catch (err) {
            wrongListContainer.innerHTML = `<div style="color: var(--rose-400); text-align: center; padding: 24px;">加载错题列表发生致命异常: ${err.message}</div>`;
        }
    }

    // 错题卡片内联一键展开折叠已存 AI 解析的超级微创新
    function toggleCardInlineAi(cardElement, question) {
        let aiBox = cardElement.querySelector('.inline-ai-box');
        if (aiBox) {
            // 如果已存在，则折叠移除
            aiBox.remove();
            return;
        }

        // 创建新容器
        aiBox = document.createElement('div');
        aiBox.className = 'inline-ai-box ai-content';
        aiBox.style.marginTop = '20px';
        aiBox.style.padding = '18px';
        aiBox.style.backgroundColor = 'var(--inner-bg)';
        aiBox.style.border = '1px solid oklch(0.64 0.21 300 / 0.2)';
        aiBox.style.borderRadius = '12px';
        aiBox.style.fontSize = '13px';
        aiBox.style.lineHeight = '1.7';
        aiBox.style.color = 'oklch(0.90 0.01 250)';
        aiBox.style.animation = 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

        const text = question.type && question.type.includes('简答') ? question.record.aiGrade : question.record.aiExplanation;

        if (window.marked) {
            aiBox.innerHTML = marked.parse(text || '');
        } else {
            aiBox.innerHTML = `<pre style="white-space: pre-wrap;">${text || ''}</pre>`;
        }

        // 插入在 footer 之前
        const footer = cardElement.querySelector('.wrong-card-footer');
        cardElement.insertBefore(aiBox, footer);
    }

    // 一键消灭错题战按钮事件绑定
    btnStartWrongPractice.addEventListener('click', () => {
        state.currentMode = 'wrong';
        switchView('practice');
        loadQuestions('wrong');
    });

    // =========================================================================
    // 9. 系统参数配置模块 (System Settings Module)
    // =========================================================================
    async function loadSystemSettings() {
        try {
            const config = await request('/api/settings');
            settingsApiBase.value = config.apiBase || '';
            settingsApiKey.value = config.apiKey || '';
            settingsModelName.value = config.modelName || '';
            settingsTemplate.value = config.promptTemplate || '';
            settingsShortTemplate.value = config.shortAnswerPromptTemplate || '';
        } catch (err) {
            console.error('加载系统设置参数出错', err);
        }
    }

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            apiBase: settingsApiBase.value.trim(),
            apiKey: settingsApiKey.value.trim(),
            modelName: settingsModelName.value.trim(),
            promptTemplate: settingsTemplate.value.trim(),
            shortAnswerPromptTemplate: settingsShortTemplate.value.trim()
        };

        if (!payload.apiBase || !payload.modelName) {
            showToast('错误：API 基准地址和模型名称不能为空！', 'error');
            return;
        }

        try {
            const res = await request('/api/settings', 'POST', payload);
            if (res.success) {
                showToast('恭喜！系统大模型配置已安全保存！✨', 'success');
            } else {
                showToast('保存失败，请检查参数。', 'error');
            }
        } catch (err) {
            showToast('保存失败：网络通信异常', 'error');
        }
    });

    // 绑定简答题作答提交、修改和自我评定事件
    if (btnSubmitShort) {
        btnSubmitShort.addEventListener('click', () => {
            const ans = shortAnswerInput.value.trim();
            if (!ans) {
                showToast('请输入你的回答后再提交！', 'error');
                return;
            }
            submitShortAnswer(ans);
        });
    }

    if (btnShortRetry) {
        btnShortRetry.addEventListener('click', () => {
            state.isSubmitted = false;
            shortAnswerInput.disabled = false;
            btnSubmitShort.disabled = false;
            feedbackPanel.style.display = 'none';
            aiExplanationBox.style.display = 'none';
            if (quizContainer) {
                quizContainer.classList.remove('has-sidebar');
            }
        });
    }

    if (btnShortPass) {
        btnShortPass.addEventListener('click', async () => {
            const question = state.questions[state.currentIndex];
            try {
                const res = await request('/api/mark-mastery', 'POST', { id: question.id, isMastered: true });
                question.record = res.record;
                showToast('标记成功！已移出地带。✨', 'success');
                if (state.currentMode === 'wrong') {
                    loadQuestions('wrong'); // 重新载入剩余错题
                } else {
                    renderQuestion();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (btnShortFail) {
        btnShortFail.addEventListener('click', async () => {
            const question = state.questions[state.currentIndex];
            try {
                const res = await request('/api/mark-mastery', 'POST', { id: question.id, isMastered: false });
                question.record = res.record;
                showToast('已确认标记为未掌握，保留在错题本中。❌', 'info');
                renderQuestion();
            } catch (err) {
                console.error(err);
            }
        });
    }

    // 绑定重置刷题进度按钮事件
    if (btnResetProgress) {
        btnResetProgress.addEventListener('click', () => {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('quiz_currentIndex_')) {
                    localStorage.removeItem(key);
                }
            });
            showToast('已成功清除所有科目的刷题进度缓存，下次答题将从第一题开始！🧹', 'success');
        });
    }

    // =========================================================================
    // 10. 初始化系统加载 (Initial System Bootstrap)
    // =========================================================================
    loadGlobalStats();
    loadCourses();
});
