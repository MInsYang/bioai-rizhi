/* Explicit public-interface translations. Original records are never translated. */
(function (global) {
  "use strict";
  const supportedLanguages = ["zh-CN", "zh-Hant", "en"];
  const STORAGE_KEY = "bioai-language";
  const messages = {
  "日知头版": [
    "日知頭版",
    "Front page"
  ],
  "全站看板": [
    "全站看板",
    "Dashboard"
  ],
  "新闻与文章": [
    "新聞與文章",
    "News & articles"
  ],
  "每日摘要": [
    "每日摘要",
    "Daily brief"
  ],
  "连接你的 AI": [
    "連接你的 AI",
    "Connect your AI"
  ],
  "专题指南": [
    "專題指南",
    "Topic guides"
  ],
  "本周收录": [
    "本週收錄",
    "This week's collection"
  ],
  "产业进展": [
    "產業進展",
    "Industry timeline"
  ],
  "Hot 关系图": [
    "Hot 關係圖",
    "Hot relationship map"
  ],
  "学术进展": [
    "學術進展",
    "Research updates"
  ],
  "公司黄页": [
    "公司黃頁",
    "Company directory"
  ],
  "信息来源": [
    "資訊來源",
    "Sources"
  ],
  "我的关注": [
    "我的關注",
    "My watchlist"
  ],
  "管理工作台": [
    "管理工作臺",
    "Editorial workspace"
  ],
  "测序与多组学": [
    "測序與多組學",
    "Sequencing & multiomics"
  ],
  "生物医药": [
    "生物醫藥",
    "Biopharma"
  ],
  "AI与模型数据": [
    "AI與模型資料",
    "AI, models & data"
  ],
  "AI 虚拟细胞": [
    "AI 虛擬細胞",
    "AI virtual cells"
  ],
  "细胞基础模型、扰动预测与数字细胞": [
    "細胞基礎模型、擾動預測與數字細胞",
    "Cell foundation models, perturbation prediction and digital cells"
  ],
  "类器官": [
    "類器官",
    "Organoids"
  ],
  "类器官模型、计算分析与 AI 药物筛选": [
    "類器官模型、計算分析與 AI 藥物篩選",
    "Organoid models, computational analysis and AI drug screening"
  ],
  "虚拟胚胎": [
    "虛擬胚胎",
    "Virtual embryos"
  ],
  "计算发育模型与相关胚胎模型研究": [
    "計算發育模型與相關胚胎模型研究",
    "Computational development and related embryo model research"
  ],
  "虚拟器官": [
    "虛擬器官",
    "Virtual organs"
  ],
  "器官数字孪生、计算建模与仿真": [
    "器官數字孿生、計算建模與仿真",
    "Organ digital twins, computational modeling and simulation"
  ],
  "AI 制药": [
    "AI 製藥",
    "AI drug discovery"
  ],
  "生成式分子设计、药物发现与虚拟筛选": [
    "生成式分子設計、藥物發現與虛擬篩選",
    "Generative molecule design, drug discovery and virtual screening"
  ],
  "融资": [
    "融資",
    "Funding"
  ],
  "合作": [
    "合作",
    "Partnership"
  ],
  "并购": [
    "併購",
    "Acquisition"
  ],
  "授权": [
    "授權",
    "Licensing"
  ],
  "产品发布": [
    "產品發佈",
    "Product launch"
  ],
  "临床进展": [
    "臨牀進展",
    "Clinical progress"
  ],
  "监管": [
    "監管",
    "Regulatory"
  ],
  "战略布局": [
    "戰略佈局",
    "Strategy"
  ],
  "论文": [
    "論文",
    "Paper"
  ],
  "模型": [
    "模型",
    "Model"
  ],
  "数据集": [
    "資料集",
    "Dataset"
  ],
  "其他进展": [
    "其他進展",
    "Other progress"
  ],
  "投资": [
    "投資",
    "Investment"
  ],
  "收购": [
    "收購",
    "Acquires"
  ],
  "获得授权": [
    "獲得授權",
    "Licenses from"
  ],
  "共同开发": [
    "共同開發",
    "Co-develops"
  ],
  "采用平台": [
    "採用平臺",
    "Adopts platform"
  ],
  "共同发表": [
    "共同發表",
    "Co-publishes"
  ],
  "文件不是受支持的 BioAI 关注名单，请使用本站导出的 JSON 文件。": [
    "文件不是受支持的 BioAI 關注名單，請使用本站導出的 JSON 文件。",
    "This is not a supported BioAI watchlist. Choose a JSON file exported from this site."
  ],
  "日期未提供": [
    "日期未提供",
    "Date not provided"
  ],
  "日期待核验": [
    "日期待覈驗",
    "Date awaiting verification"
  ],
  "数据服务暂不可用。请确认后端已启动，再刷新重试。": [
    "資料服務暫不可用。請確認後端已啓動，再刷新重試。",
    "The data service is unavailable. Please refresh and try again."
  ],
  "请求未成功，请稍后重试。": [
    "請求未成功，請稍後重試。",
    "The request did not succeed. Please try again later."
  ],
  "浏览公司黄页": [
    "瀏覽公司黃頁",
    "Browse company directory"
  ],
  "上一页": [
    "上一頁",
    "Previous"
  ],
  "下一页": [
    "下一頁",
    "Next"
  ],
  "预印本": [
    "預印本",
    "Preprint"
  ],
  " · 版本未标注": [
    " · 版本未標註",
    " · version not specified"
  ],
  "学术索引收录": [
    "學術索引收錄",
    "Academic index record"
  ],
  "原文线索": [
    "原文線索",
    "Source record"
  ],
  "来源刊期（晚于当前日期） ": [
    "來源刊期（晚於當前日期） ",
    "Source issue date (in the future) "
  ],
  "收录于 ": [
    "收錄於 ",
    "Collected on "
  ],
  "摘要暂未提供，点击查看原文。": [
    "摘要暫未提供，點擊查看原文。",
    "No abstract provided. Open the original source to read more."
  ],
  "尚未转为已核验事件": [
    "尚未轉爲已覈驗事件",
    "Not yet a verified event"
  ],
  "原文": [
    "原文",
    "Original source"
  ],
  "分享页 ↗": [
    "分享頁 ↗",
    "Share page ↗"
  ],
  "收录 ": [
    "收錄 ",
    "Collected "
  ],
  "从公司官方披露与原始报道，追踪这条进展的细节与出处。": [
    "從公司官方披露與原始報道，追蹤這條進展的細節與出處。",
    "Explore the details and sources through company disclosures and original reporting."
  ],
  "重点期刊 · 学术原文": [
    "重點期刊 · 學術原文",
    "Selected journals · original research"
  ],
  "行业原文": [
    "行業原文",
    "Industry source"
  ],
  "阅读原文": [
    "閱讀原文",
    "Read original"
  ],
  "行业动态": [
    "行業動態",
    "Industry news"
  ],
  "公司公告、融资消息、产品与临床进展，从原始出处了解产业变化。": [
    "公司公告、融資消息、產品與臨牀進展，從原始出處瞭解產業變化。",
    "Company disclosures, funding, product and clinical updates, with original sources."
  ],
  "阅读行业原文": [
    "閱讀行業原文",
    "Read industry sources"
  ],
  "合作与布局": [
    "合作與佈局",
    "Partnerships & strategy"
  ],
  "沿时间线追踪合作、授权、投资与并购，在 Hot 图中查看公司联系。": [
    "沿時間線追蹤合作、授權、投資與併購，在 Hot 圖中查看公司聯繫。",
    "Follow partnerships, licensing, investment and acquisitions, then explore company links in the Hot map."
  ],
  "打开产业进展": [
    "打開產業進展",
    "Open industry timeline"
  ],
  "重点期刊与主题相关研究，为生物医药产业方向提供证据与新方法。": [
    "重點期刊與主題相關研究，爲生物醫藥產業方向提供證據與新方法。",
    "Selected journals and relevant research provide evidence and methods for biopharma."
  ],
  "浏览重点期刊": [
    "瀏覽重點期刊",
    "Browse selected journals"
  ],
  "检索中国与海外公司、历史品牌、官方网站及其最新动态。": [
    "檢索中國與海外公司、歷史品牌、官方網站及其最新動態。",
    "Search companies in China and abroad, historical brands, official websites and recent updates."
  ],
  "查找公司档案": [
    "查找公司檔案",
    "Find company profiles"
  ],
  "/ 栏目": [
    "/ 欄目",
    "/ SECTION"
  ],
  "等待新的行业来信": [
    "等待新的行業來信",
    "Awaiting new industry dispatches"
  ],
  "近 30 天暂未收录符合主题的公司原文。可浏览历史内容，或检查来源更新状态。": [
    "近 30 天暫未收錄符合主題的公司原文。可瀏覽歷史內容，或檢查來源更新狀態。",
    "No relevant company source records in the past 30 days. Browse the archive or check source status."
  ],
  "进入行业栏目 →": [
    "進入行業欄目 →",
    "Open industry news →"
  ],
  "尚无记录": [
    "尚無記錄",
    "No records yet"
  ],
  "查看公司关联与原始证据。": [
    "查看公司關聯與原始證據。",
    "View company links and original evidence."
  ],
  "条原文证据": [
    "條原文證據",
    "source evidence records"
  ],
  "已核验的合作、融资与布局进展将在这里展示。公司公告可先从行业原文阅读。": [
    "已覈驗的合作、融資與佈局進展將在這裏展示。公司公告可先從行業原文閱讀。",
    "Verified partnerships, funding and strategic updates will appear here. Company disclosures are available in industry news."
  ],
  "当前窗口暂无收录，学术版可查看历史记录。": [
    "當前窗口暫無收錄，學術版可查看歷史記錄。",
    "No records in this window. Research updates include historical records."
  ],
  "问象 · WENXIANG": [
    "問象 · WENXIANG",
    "Wenxiang"
  ],
  "头版快捷导航": [
    "頭版快捷導航",
    "Front-page shortcuts"
  ],
  "MCP 与订阅": [
    "MCP 與訂閱",
    "MCP & subscriptions"
  ],
  "进入全站看板": [
    "進入全站看板",
    "Open dashboard"
  ],
  "问象 Logo": [
    "問象 Logo",
    "Wenxiang logo"
  ],
  "BioAI 日知": [
    "BioAI 日知",
    "BioAI Daily"
  ],
  "连接生物与智能，追踪每一步进展。": [
    "連接生物與智能，追蹤每一步進展。",
    "Connecting biology and intelligence, following every advance."
  ],
  "生物医药产业观察": [
    "生物醫藥產業觀察",
    "Biopharma industry observatory"
  ],
  "· 北京时间": [
    "· 北京時間",
    "· Beijing time"
  ],
  "每小时更新 · 保留原始出处": [
    "每小時更新 · 保留原始出處",
    "Updated hourly · original sources retained"
  ],
  "来源与更新状态 ↗": [
    "來源與更新狀態 ↗",
    "Sources & update status ↗"
  ],
  "关于日知": [
    "關於日知",
    "About BioAI Daily"
  ],
  "产业是主线，研究是依据。": [
    "產業是主線，研究是依據。",
    "Industry in focus. Research as evidence."
  ],
  "关注 AI 如何走进生物医药：从虚拟生命模型，到药物研发与公司合作。": [
    "關注 AI 如何走進生物醫藥：從虛擬生命模型，到藥物研發與公司合作。",
    "Follow AI in biopharma: from virtual life models to drug development and company partnerships."
  ],
  "栏目导读": [
    "欄目導讀",
    "Section guide"
  ],
  "产业来信": [
    "產業來信",
    "Industry dispatches"
  ],
  "全部动态 ↗": [
    "全部動態 ↗",
    "All updates ↗"
  ],
  "原文收录与事件核验分别标注。最近成功采集：": [
    "原文收錄與事件覈驗分別標註。最近成功擷取：",
    "Source collection and event verification are labeled separately. Last successful collection:"
  ],
  "。": [
    "。",
    "."
  ],
  "合作与产业进展": [
    "合作與產業進展",
    "Partnerships & industry updates"
  ],
  "证据核验": [
    "證據覈驗",
    "Evidence verified"
  ],
  "查看时间线 ↗": [
    "查看時間線 ↗",
    "View timeline ↗"
  ],
  "打开 Hot 关系图 ↗": [
    "打開 Hot 關係圖 ↗",
    "Open Hot relationship map ↗"
  ],
  "研究参照": [
    "研究參照",
    "Research reference"
  ],
  "学术版 ↗": [
    "學術版 ↗",
    "Research edition ↗"
  ],
  "持续关注的五个赛道": [
    "持續關注的五個賽道",
    "Five tracks we follow"
  ],
  "打开完整看板 ↗": [
    "打開完整看板 ↗",
    "Open full dashboard ↗"
  ],
  "一条新闻，连回一家公司的全貌。": [
    "一條新聞，連回一家公司的全貌。",
    "One story, a company's wider picture."
  ],
  "从新格元、寻因、诺禾致源到海外生物医药公司，检索中英文名称、历史品牌与官方信息。": [
    "從新格元、尋因、諾禾致源到海外生物醫藥公司，檢索中英文名稱、歷史品牌與官方資訊。",
    "Search Chinese and English names, historical brands and official details for Singleron, SeekGene, Novogene and companies worldwide."
  ],
  "打开公司黄页 →": [
    "打開公司黃頁 →",
    "Open company directory →"
  ],
  "让日知进入你的阅读工作流。": [
    "讓日知進入你的閱讀工作流。",
    "Bring BioAI Daily into your reading workflow."
  ],
  "通过 RSS 订阅更新，或用公开只读 MCP，让你的 AI 查询公司、文章与信息来源。": [
    "通過 RSS 訂閱更新，或用公開只讀 MCP，讓你的 AI 查詢公司、文章與資訊來源。",
    "Subscribe with RSS or let your AI query companies, articles and sources through our public, read-only MCP."
  ],
  "查看订阅与 MCP 接入 →": [
    "查看訂閱與 MCP 接入 →",
    "View RSS & MCP connection →"
  ],
  "问象出品 · 以可追溯的原文连接行业动态、公司与研究。": [
    "問象出品 · 以可追溯的原文連接行業動態、公司與研究。",
    "By Wenxiang · Connecting industry, companies and research through traceable original sources."
  ],
  "查看来源覆盖": [
    "查看來源覆蓋",
    "View source coverage"
  ],
  " · 编辑精选": [
    " · 編輯精選",
    " · Editor's pick"
  ],
  "条证据": [
    "條證據",
    "evidence records"
  ],
  "查看证据 ↗": [
    "查看證據 ↗",
    "View evidence ↗"
  ],
  "7 天": [
    "7 天",
    "7 days"
  ],
  "30 天": [
    "30 天",
    "30 days"
  ],
  "90 天": [
    "90 天",
    "90 days"
  ],
  "1 年": [
    "1 年",
    "1 year"
  ],
  "全部": [
    "全部",
    "All time"
  ],
  "中国大陆": [
    "中國大陸",
    "Mainland China"
  ],
  "中国香港": [
    "中國香港",
    "Hong Kong, China"
  ],
  "海外": [
    "海外",
    "International"
  ],
  "跨地区布局": [
    "跨地區佈局",
    "Cross-region"
  ],
  "叠加学术进展": [
    "疊加學術進展",
    "Include research updates"
  ],
  "从": [
    "從",
    "From"
  ],
  "开始日期": [
    "開始日期",
    "Start date"
  ],
  "至": [
    "至",
    "To"
  ],
  "结束日期": [
    "結束日期",
    "End date"
  ],
  "搜索进展关键词": [
    "搜索進展關鍵詞",
    "Search update keywords"
  ],
  "搜索进展": [
    "搜索進展",
    "Search updates"
  ],
  "公司地区": [
    "公司地區",
    "Company region"
  ],
  "全部地区": [
    "全部地區",
    "All regions"
  ],
  "事件类型": [
    "事件類型",
    "Event type"
  ],
  "全部类型": [
    "全部類型",
    "All types"
  ],
  "应用筛选": [
    "應用篩選",
    "Apply filters"
  ],
  "结束日期不能早于开始日期": [
    "結束日期不能早於開始日期",
    "The end date cannot be before the start date"
  ],
  "公司档案": [
    "公司檔案",
    "Company profile"
  ],
  "收录公司与相关技术提供方": [
    "收錄公司與相關技術提供方",
    "Companies and technology providers"
  ],
  "自动采集来源": [
    "自動擷取來源",
    "Automated sources"
  ],
  "官网与公共订阅": [
    "官網與公共訂閱",
    "Official websites & public feeds"
  ],
  "主题原文": [
    "主題原文",
    "Relevant source records"
  ],
  "自动归类 · 保留出处": [
    "自動歸類 · 保留出處",
    "Automatic classification · sources retained"
  ],
  "已核验事件": [
    "已覈驗事件",
    "Verified events"
  ],
  "附可追溯证据": [
    "附可追溯證據",
    "With traceable evidence"
  ],
  "原文正在积累": [
    "原文正在積累",
    "Source records are accumulating"
  ],
  "已验证来源完成抓取后，原始记录会出现在这里。": [
    "已驗證來源完成抓取後，原始記錄會出現在這裏。",
    "Original records will appear here after collection from verified sources."
  ],
  "查看信息来源": [
    "查看資訊來源",
    "View sources"
  ],
  "家公司": [
    "家公司",
    "companies"
  ],
  "尚无近期已核验事件": [
    "尚無近期已覈驗事件",
    "No recent verified events"
  ],
  "已采集原文保留在来源库；复核通过的事件会同步到公司时间线。": [
    "已擷取原文保留在來源庫；複覈通過的事件會同步到公司時間線。",
    "Collected source records remain in the source library. Reviewed events are added to company timelines."
  ],
  "查看原始来源": [
    "查看原始來源",
    "View original sources"
  ],
  "BIOAI INTELLIGENCE · 问象": [
    "BIOAI INTELLIGENCE · 問象",
    "BIOAI INTELLIGENCE · WENXIANG"
  ],
  "追踪 AI 与生物医药，": [
    "追蹤 AI 與生物醫藥，",
    "Follow AI and biopharma,"
  ],
  "看见产业的下一步。": [
    "看見產業的下一步。",
    "see what comes next."
  ],
  "以公司动态、合作与融资为主线，连接虚拟细胞、类器官、虚拟胚胎、虚拟器官与 AI 制药的研究依据。": [
    "以公司動態、合作與融資爲主線，連接虛擬細胞、類器官、虛擬胚胎、虛擬器官與 AI 製藥的研究依據。",
    "Follow company updates, partnerships and funding, connected to research in virtual cells, organoids, virtual embryos, virtual organs and AI drug discovery."
  ],
  "每一步进展，都保留来处": [
    "每一步進展，都保留來處",
    "Every advance keeps its source"
  ],
  "从官方披露与公共学术索引出发，": [
    "從官方披露與公共學術索引出發，",
    "Start with official disclosures and public academic indexes,"
  ],
  "区分原文收录与核验后的事实。": [
    "區分原文收錄與覈驗後的事實。",
    "distinguish collected records from verified facts."
  ],
  "查看来源接入状态 ↗": [
    "查看來源接入狀態 ↗",
    "View source status ↗"
  ],
  "最新行业原文": [
    "最新行業原文",
    "Latest industry sources"
  ],
  "全部新闻与文章 ↗": [
    "全部新聞與文章 ↗",
    "All news & articles ↗"
  ],
  "最近成功采集": [
    "最近成功擷取",
    "Last successful collection"
  ],
  "· 原文线索经复核后，才进入产业进展与关系图。": [
    "· 原文線索經複覈後，才進入產業進展與關係圖。",
    "· Source records appear in timelines and relationship maps after review."
  ],
  "国内公司速览": [
    "國內公司速覽",
    "China company snapshot"
  ],
  "全部公司 ↗": [
    "全部公司 ↗",
    "All companies ↗"
  ],
  "产业覆盖": [
    "產業覆蓋",
    "Industry coverage"
  ],
  "地区按种子库登记的所在地与布局分类，不推断内外资股权性质。": [
    "地區按種子庫登記的所在地與佈局分類，不推斷內外資股權性質。",
    "Regions reflect registered locations and operations, without inferring company ownership."
  ],
  "近期已核验进展": [
    "近期已覈驗進展",
    "Recent verified updates"
  ],
  "查看进展树 ↗": [
    "查看進展樹 ↗",
    "View timeline ↗"
  ],
  "关注 AI 在生物医药领域的公司动态、融资合作与发展布局。默认展示行业原文；学术文章可在筛选中单独查看。": [
    "關注 AI 在生物醫藥領域的公司動態、融資合作與發展佈局。預設展示行業原文；學術文章可在篩選中單獨查看。",
    "Follow AI in biopharma through company updates, funding, partnerships and strategy. Industry sources appear by default; use filters to view research articles."
  ],
  "搜索新闻文章": [
    "搜索新聞文章",
    "Search news & articles"
  ],
  "关键词、模型名、公司名": [
    "關鍵詞、模型名、公司名",
    "Keywords, model or company name"
  ],
  "研究主题": [
    "研究主題",
    "Research topic"
  ],
  "全部主题": [
    "全部主題",
    "All topics"
  ],
  "内容类型": [
    "內容類型",
    "Content type"
  ],
  "全部内容": [
    "全部內容",
    "All content"
  ],
  "公司与行业原文": [
    "公司與行業原文",
    "Company & industry sources"
  ],
  "学术文章": [
    "學術文章",
    "Research articles"
  ],
  "日期范围": [
    "日期範圍",
    "Date range"
  ],
  "搜索": [
    "搜索",
    "Search"
  ],
  "订阅 RSS ↗": [
    "訂閱 RSS ↗",
    "Subscribe via RSS ↗"
  ],
  "正在读取主题原文…": [
    "正在讀取主題原文…",
    "Loading source records…"
  ],
  "当前筛选下暂无收录": [
    "當前篩選下暫無收錄",
    "No records match these filters"
  ],
  "可以扩大日期范围，或检查来源的实际接入状态。": [
    "可以擴大日期範圍，或檢查來源的實際接入狀態。",
    "Expand the date range or check source connection status."
  ],
  "条主题原文 · 保留来源时间与收录时间 · 主题按关键词自动归类": [
    "條主題原文 · 保留來源時間與收錄時間 · 主題按關鍵詞自動歸類",
    "source records · source and collection dates retained · topics classified by keywords"
  ],
  "北京时间每天 08:00 汇集前 24 小时新入库的主题原文。保留出处，不自动编造新闻或研究结论。": [
    "北京時間每天 08:00 彙集前 24 小時新入庫的主題原文。保留出處，不自動編造新聞或研究結論。",
    "At 08:00 Beijing time each day, collect relevant source records added in the previous 24 hours. Sources are retained; no news or research conclusions are invented."
  ],
  "这一期没有新增主题原文": [
    "這一期沒有新增主題原文",
    "No new source records in this edition"
  ],
  "来源无更新时保留空日报，不重复旧文章填充。": [
    "來源無更新時保留空日報，不重複舊文章填充。",
    "A daily brief stays empty when sources have no updates; older articles are not reused as filler."
  ],
  "浏览历史原文": [
    "瀏覽歷史原文",
    "Browse the archive"
  ],
  "复制日报链接": [
    "複製日報鏈接",
    "Copy daily brief link"
  ],
  "窗口": [
    "窗口",
    "Window"
  ],
  "· 当前公开": [
    "· 當前公開",
    "· Public records:"
  ],
  "条（最多选入 100 条）": [
    "條（最多選入 100 條）",
    "records (up to 100 selected)"
  ],
  "首份日报尚未生成": [
    "首份日報尚未生成",
    "The first daily brief is not ready"
  ],
  "调度运行到北京时间 08:00 后，这里会出现当天的摘要。": [
    "調度運行到北京時間 08:00 後，這裏會出現當天的摘要。",
    "The day's brief will appear after the scheduled 08:00 Beijing time run."
  ],
  "先浏览原文": [
    "先瀏覽原文",
    "Browse sources first"
  ],
  "让你的 AI 读懂产业与研究进展": [
    "讓你的 AI 讀懂產業與研究進展",
    "Let your AI explore industry and research"
  ],
  "通过只读 MCP 查询原文、公司和来源状态。每条结果带出处，适合研究助手、投资研究和每日简报工作流。": [
    "通過只讀 MCP 查詢原文、公司和來源狀態。每條結果帶出處，適合研究助手、投資研究和每日簡報工作流。",
    "Query sources, companies and source status through read-only MCP. Each result includes its source, for research assistants, investment research and daily brief workflows."
  ],
  "GitHub 源代码与完整接入说明": [
    "GitHub 源代碼與完整接入說明",
    "GitHub source code & connection guide"
  ],
  "STREAMABLE HTTP · 只读": [
    "STREAMABLE HTTP · 只讀",
    "STREAMABLE HTTP · READ ONLY"
  ],
  "添加一个 MCP 服务": [
    "添加一個 MCP 服務",
    "Add an MCP service"
  ],
  "在支持远程 MCP 的客户端中选择 HTTP / Streamable HTTP，填入下面的服务地址。公开读取无需 API Key。": [
    "在支持遠程 MCP 的客戶端中選擇 HTTP / Streamable HTTP，填入下面的服務地址。公開讀取無需 API Key。",
    "In a client that supports remote MCP, choose HTTP / Streamable HTTP and enter the service address below. Public reading does not require an API key."
  ],
  "复制地址": [
    "複製地址",
    "Copy address"
  ],
  "通用配置示例": [
    "通用配置示例",
    "Configuration example"
  ],
  "不同客户端配置格式略有不同。Claude 可在自定义连接器中填写地址；Cursor 的 mcpServers 使用 url；Codex 的 TOML 使用 [mcp_servers.bioai] 与 url。": [
    "不同客戶端配置格式略有不同。Claude 可在自定義連接器中填寫地址；Cursor 的 mcpServers 使用 url；Codex 的 TOML 使用 [mcp_servers.bioai] 與 url。",
    "Configuration formats vary by client. Claude accepts the address in a custom connector; Cursor uses url in mcpServers; Codex TOML uses [mcp_servers.bioai] and url."
  ],
  "可以这样问": [
    "可以這樣問",
    "Try these questions"
  ],
  "检索最近 30 天虚拟细胞的研究，区分预印本与索引文章，并列出原始出处。": [
    "檢索最近 30 天虛擬細胞的研究，區分預印本與索引文章，並列出原始出處。",
    "Find virtual-cell research from the past 30 days, distinguish preprints from indexed articles and list original sources."
  ],
  "查找新格元、寻因和诺禾致源的公司档案、官网与已验证来源。": [
    "查找新格元、尋因和諾禾致源的公司檔案、官網與已驗證來源。",
    "Find company profiles, websites and verified sources for Singleron, SeekGene and Novogene."
  ],
  "比较虚拟器官与类器官相关的近期进展，说明来源覆盖的缺口。": [
    "比較虛擬器官與類器官相關的近期進展，說明來源覆蓋的缺口。",
    "Compare recent virtual-organ and organoid updates, explaining gaps in source coverage."
  ],
  "订阅你关心的赛道": [
    "訂閱你關心的賽道",
    "Subscribe to your research tracks"
  ],
  "RSS 汇集最新行业原文与重点期刊研究。更新取决于原始来源，每条保留出处。": [
    "RSS 彙集最新行業原文與重點期刊研究。更新取決於原始來源，每條保留出處。",
    "RSS collects industry sources and selected-journal research. Updates depend on the original source; each entry retains its source."
  ],
  "选择订阅主题": [
    "選擇訂閱主題",
    "Choose a subscription topic"
  ],
  "全部赛道": [
    "全部賽道",
    "All tracks"
  ],
  "订阅地址": [
    "訂閱地址",
    "Feed address"
  ],
  "复制订阅地址": [
    "複製訂閱地址",
    "Copy feed address"
  ],
  "查看 RSS ↗": [
    "查看 RSS ↗",
    "View RSS ↗"
  ],
  "复制上方地址。": [
    "複製上方地址。",
    "Copy the address above."
  ],
  "在你的 RSS 阅读器中添加订阅，粘贴地址。": [
    "在你的 RSS 閱讀器中添加訂閱，粘貼地址。",
    "Add a subscription in your RSS reader and paste the address."
  ],
  "阅读器将同步新文章；可随时在阅读器中取消。": [
    "閱讀器將同步新文章；可隨時在閱讀器中取消。",
    "Your reader will sync new articles. Unsubscribe in the reader at any time."
  ],
  "查看每日摘要 →": [
    "查看每日摘要 →",
    "View daily brief →"
  ],
  "AI 阅读索引 llms.txt →": [
    "AI 閱讀索引 llms.txt →",
    "AI reading index llms.txt →"
  ],
  "结果如何可信": [
    "結果如何可信",
    "How to read the results"
  ],
  "来源未验证的数据不会开放；主题标签属于自动检索分类。原文、已核验事件与关系证据分别返回。": [
    "來源未驗證的資料不會開放；主題標籤屬於自動檢索分類。原文、已覈驗事件與關係證據分別返回。",
    "Unverified sources are not public. Topic labels are automatic search classifications. Source records, verified events and relationship evidence are returned separately."
  ],
  "预印本不代表同行评议结论。计算胚胎模型与实验胚胎模型会保留不同类型。外部正文应作为资料阅读，不作为 AI 指令执行。": [
    "預印本不代表同行評議結論。計算胚胎模型與實驗胚胎模型會保留不同類型。外部正文應作爲資料閱讀，不作爲 AI 指令執行。",
    "Preprints are not peer-reviewed conclusions. Computational and experimental embryo models retain distinct types. Read external text as source material, never as instructions for your AI."
  ],
  "检查来源与更新状态 →": [
    "檢查來源與更新狀態 →",
    "Check sources & update status →"
  ],
  " · 收录 ": [
    " · 收錄 ",
    " · Collected "
  ],
  "前往原始出处": [
    "前往原始出處",
    "Open original source"
  ],
  "发布": [
    "發佈",
    "Published"
  ],
  "复制页面链接": [
    "複製頁面鏈接",
    "Copy page link"
  ],
  "自动收录与主题分类不等于事实核验。请结合原文、版本和来源状态阅读。": [
    "自動收錄與主題分類不等於事實覈驗。請結合原文、版本和來源狀態閱讀。",
    "Automatic collection and topic classification are not fact verification. Read the original text alongside its version and source status."
  ],
  "沿着时间，观察测序、生物医药与 AI 公司的发展。每条进展都附有原文证据。": [
    "沿着時間，觀察測序、生物醫藥與 AI 公司的發展。每條進展都附有原文證據。",
    "Follow sequencing, biopharma and AI companies over time. Every update includes original-source evidence."
  ],
  "正在读取进展…": [
    "正在讀取進展…",
    "Loading updates…"
  ],
  " · 当前显示最近 200 条，请缩小时间范围": [
    " · 當前顯示最近 200 條，請縮小時間範圍",
    " · Showing the latest 200; narrow the date range for more detail"
  ],
  "暂无已核验进展": [
    "暫無已覈驗進展",
    "No verified updates yet"
  ],
  "尝试其他日期，或先浏览公司与来源。": [
    "嘗試其他日期，或先瀏覽公司與來源。",
    "Try a different date range, or browse companies and sources first."
  ],
  "浏览公司": [
    "瀏覽公司",
    "Browse companies"
  ],
  "条符合筛选的已核验事件 · 跨产业事件可在关联方向同时展示": [
    "條符合篩選的已覈驗事件 · 跨產業事件可在關聯方向同時展示",
    "verified events match · cross-industry events may appear in multiple tracks"
  ],
  "从一条有证据的合作出发，观察公司之间的联系。当前关系节点为公司。": [
    "從一條有證據的合作出發，觀察公司之間的聯繫。當前關係節點爲公司。",
    "Start with an evidence-backed partnership and explore company connections. Current relationship nodes represent companies."
  ],
  "正在读取关系…": [
    "正在讀取關係…",
    "Loading relationships…"
  ],
  "还没有附有事件证据的关系": [
    "還沒有附有事件證據的關係",
    "No relationships with event evidence yet"
  ],
  "合作、投资与授权关系将在事件核验后出现。": [
    "合作、投資與授權關係將在事件覈驗後出現。",
    "Partnership, investment and licensing links appear after event verification."
  ],
  "查看产业进展": [
    "查看產業進展",
    "View industry timeline"
  ],
  " · 最多展示最近 300 条": [
    " · 最多展示最近 300 條",
    " · Showing up to the latest 300"
  ],
  "个公司 ·": [
    "個公司 ·",
    "companies ·"
  ],
  "条关系": [
    "條關係",
    "relationships"
  ],
  "· 点击关系查看证据": [
    "· 點擊關係查看證據",
    "· Select a relationship to view evidence"
  ],
  "公司合作关系图，所有关系也列在右侧": [
    "公司合作關係圖，所有關係也列在右側",
    "Company relationship map. Every relationship is also listed alongside it."
  ],
  " · 暂未自动更新": [
    " · 暫未自動更新",
    " · not yet updating automatically"
  ],
  "期刊官网 ↗": [
    "期刊官網 ↗",
    "Journal website ↗"
  ],
  "收录期刊与筛选规则 ·": [
    "收錄期刊與篩選規則 ·",
    "Journal list & selection rules ·"
  ],
  "本重点期刊": [
    "本重點期刊",
    "selected journals"
  ],
  "期刊元数据来自公共学术索引；本站不提供付费全文。规则版本": [
    "期刊元資料來自公共學術索引；本站不提供付費全文。規則版本",
    "Journal metadata comes from public academic indexes. This site does not provide paid full text. Policy version"
  ],
  "默认展示重点期刊中与本站主题相关的已发表研究。期刊名单用于筛选范围，不替代对单篇研究质量与产业价值的判断。": [
    "預設展示重點期刊中與本站主題相關的已發表研究。期刊名單用於篩選範圍，不替代對單篇研究質量與產業價值的判斷。",
    "Published research in selected journals and relevant to this site's topics appears by default. The journal list defines scope, without judging an individual study's quality or industry value."
  ],
  "最近 7 天": [
    "最近 7 天",
    "Past 7 days"
  ],
  "最近 30 天": [
    "最近 30 天",
    "Past 30 days"
  ],
  "最近 90 天": [
    "最近 90 天",
    "Past 90 days"
  ],
  "全部收录": [
    "全部收錄",
    "All records"
  ],
  "搜索虚拟细胞、organoid、digital twin…": [
    "搜索虛擬細胞、organoid、digital twin…",
    "Search virtual cells, organoids, digital twins…"
  ],
  "搜索学术原文": [
    "搜索學術原文",
    "Search research sources"
  ],
  "学术来源": [
    "學術來源",
    "Research source"
  ],
  "全部学术来源": [
    "全部學術來源",
    "All research sources"
  ],
  "期刊收录范围": [
    "期刊收錄範圍",
    "Journal scope"
  ],
  "重点期刊 · 已发表文献": [
    "重點期刊 · 已發表文獻",
    "Selected journals · published research"
  ],
  "全部历史索引 · 含预印本": [
    "全部歷史索引 · 含預印本",
    "All historical indexes · including preprints"
  ],
  "学术时间范围": [
    "學術時間範圍",
    "Research date range"
  ],
  "编辑精选": [
    "編輯精選",
    "Editor's pick"
  ],
  "正在读取学术记录…": [
    "正在讀取學術記錄…",
    "Loading research records…"
  ],
  "已核验精选": [
    "已覈驗精選",
    "Verified selections"
  ],
  "重点期刊文献": [
    "重點期刊文獻",
    "Selected-journal articles"
  ],
  "历史学术原始记录": [
    "歷史學術原始記錄",
    "Historical research records"
  ],
  "当前筛选下暂无学术记录": [
    "當前篩選下暫無學術記錄",
    "No research records match these filters"
  ],
  "可以扩大日期范围，或查看公共订阅的接入状态。": [
    "可以擴大日期範圍，或查看公共訂閱的接入狀態。",
    "Expand the date range or check public-feed connection status."
  ],
  "条": [
    "條",
    "records"
  ],
  "· 展示实际收录的原始资料": [
    "· 展示實際收錄的原始資料",
    "· Displaying source material actually collected"
  ],
  "从官网身份与原文出处确认消息来源。来源归属验证、抓取成功和事件复核是三个独立步骤。": [
    "從官網身份與原文出處確認消息來源。來源歸屬驗證、抓取成功和事件複覈是三個獨立步驟。",
    "Check messages against website identity and original sources. Source ownership verification, successful collection and event review are separate steps."
  ],
  " · 最近调度失败，正在等待恢复": [
    " · 最近調度失敗，正在等待恢復",
    " · The latest scheduled run failed; awaiting recovery"
  ],
  "自动更新计划：已接入主题来源每小时检查；使用页面时每 5 分钟检查更新（闲置 2 分钟后暂停）；每日 08:00（北京时间）汇总前 24 小时新入库原文。是否已运行以下方实际调度时间为准。": [
    "自動更新計劃：已接入主題來源每小時檢查；使用頁面時每 5 分鐘檢查更新（閒置 2 分鐘後暫停）；每日 08:00（北京時間）彙總前 24 小時新入庫原文。是否已運行以下方實際調度時間爲準。",
    "Update schedule: connected sources are checked hourly; the page checks every 5 minutes while active, pausing after 2 idle minutes. At 08:00 Beijing time daily, the brief collects source records added in the previous 24 hours. Actual run times are shown below."
  ],
  "搜索公司、来源或网址": [
    "搜索公司、來源或網址",
    "Search company, source or URL"
  ],
  "搜索来源": [
    "搜索來源",
    "Search sources"
  ],
  "来源状态": [
    "來源狀態",
    "Source status"
  ],
  "全部来源": [
    "全部來源",
    "All sources"
  ],
  "已接入自动采集": [
    "已接入自動擷取",
    "Automated collection connected"
  ],
  "待验证": [
    "待驗證",
    "Awaiting verification"
  ],
  "适配未接入": [
    "適配未接入",
    "Adapter not connected"
  ],
  "连续失败 ≥ 3 次": [
    "連續失敗 ≥ 3 次",
    "3 or more consecutive failures"
  ],
  "最近成功采集：": [
    "最近成功擷取：",
    "Last successful collection:"
  ],
  "· 最近成功调度：": [
    "· 最近成功調度：",
    "· Last successful schedule:"
  ],
  "归属已验证": [
    "歸屬已驗證",
    "Ownership verified"
  ],
  "验证已拒绝": [
    "驗證已拒絕",
    "Verification rejected"
  ],
  "采集适配未接入": [
    "擷取適配未接入",
    "Collection adapter not connected"
  ],
  "待接入自动更新": [
    "待接入自動更新",
    "Awaiting automated updates"
  ],
  " · 直连暂不可用，可从 Europe PMC 查找预印本": [
    " · 直連暫不可用，可從 Europe PMC 查找預印本",
    " · Direct access unavailable; find preprints in Europe PMC"
  ],
  "次连续失败": [
    "次連續失敗",
    "consecutive failures"
  ],
  "条来源": [
    "條來源",
    "sources"
  ],
  "来源 / 公司": [
    "來源 / 公司",
    "Source / company"
  ],
  "归属与接入": [
    "歸屬與接入",
    "Ownership & connection"
  ],
  "最近成功": [
    "最近成功",
    "Last success"
  ],
  "把关心的公司留在这里。可导出名单，在另一台设备导入；关注保存在当前浏览器，需要手动迁移。": [
    "把關心的公司留在這裏。可導出名單，在另一臺設備導入；關注保存在當前瀏覽器，需要手動遷移。",
    "Keep the companies you follow here. Export your watchlist and import it on another device. It is stored in this browser and needs manual transfer."
  ],
  "随身带走你的关注名单": [
    "隨身帶走你的關注名單",
    "Take your watchlist with you"
  ],
  "导入会与现有关注合并。文件仅在浏览器中读取，不上传服务器。": [
    "導入會與現有關注合併。文件僅在瀏覽器中讀取，不上傳服務器。",
    "Imports merge with your current watchlist. The file is read in your browser and is not uploaded."
  ],
  "导出名单": [
    "導出名單",
    "Export watchlist"
  ],
  "导入名单": [
    "導入名單",
    "Import watchlist"
  ],
  "尚无已核验进展": [
    "尚無已覈驗進展",
    "No verified updates yet"
  ],
  "官网": [
    "官網",
    "Website"
  ],
  "公司详情 →": [
    "公司詳情 →",
    "Company details →"
  ],
  "尚未关注公司": [
    "尚未關注公司",
    "No companies followed yet"
  ],
  "在公司黄页点击“关注”，即可建立自己的观察名单。": [
    "在公司黃頁點擊“關注”，即可建立自己的觀察名單。",
    "Select “Follow” in the company directory to build your watchlist."
  ],
  "已导出 ": [
    "已導出 ",
    "Exported "
  ],
  " 家公司。请在另一台设备的“我的关注”导入此文件。": [
    " 家公司。請在另一臺設備的“我的關注”導入此文件。",
    " companies. Import this file into “My watchlist” on your other device."
  ],
  "关注名单文件不能超过 64 KB。": [
    "關注名單文件不能超過 64 KB。",
    "A watchlist file cannot exceed 64 KB."
  ],
  "当前浏览器无法保存关注，请检查浏览器的本地存储设置。": [
    "當前瀏覽器無法保存關注，請檢查瀏覽器的本地存儲設置。",
    "This browser cannot save your watchlist. Check its local storage settings."
  ],
  "；跳过": [
    "；跳過",
    "; skipped"
  ],
  "个当前黄页未匹配的名称": [
    "個當前黃頁未匹配的名稱",
    "names not found in the current directory"
  ],
  "导入完成，新增": [
    "導入完成，新增",
    "Import complete. Added"
  ],
  "。现有关注已保留。": [
    "。現有關注已保留。",
    ". Existing follows were retained."
  ],
  "无法读取 JSON，请选择本站导出的关注名单文件。": [
    "無法讀取 JSON，請選擇本站導出的關注名單文件。",
    "Cannot read JSON. Choose a watchlist file exported from this site."
  ],
  "正在读取证据…": [
    "正在讀取證據…",
    "Loading evidence…"
  ],
  "查看原始出处": [
    "查看原始出處",
    "View original source"
  ],
  "正文位置": [
    "正文位置",
    "Text position"
  ],
  "· 采集内容哈希": [
    "· 擷取內容哈希",
    "· collected-content hash"
  ],
  "VERIFIED EVENT · 已核验事件": [
    "VERIFIED EVENT · 已覈驗事件",
    "VERIFIED EVENT"
  ],
  "发生日期": [
    "發生日期",
    "Event date"
  ],
  "· 发布日期": [
    "· 發佈日期",
    "· Publication date"
  ],
  "前往原文": [
    "前往原文",
    "Read original source"
  ],
  "预印本：未经期刊同行评议。请结合原文和后续版本判断。": [
    "預印本：未經期刊同行評議。請結合原文和後續版本判斷。",
    "Preprint: not peer-reviewed by a journal. Check the original source and later versions."
  ],
  "以下为来源中保存的正文或摘要，尚未作为已核验事件发布。": [
    "以下爲來源中保存的正文或摘要，尚未作爲已覈驗事件發佈。",
    "The following text or abstract was saved from the source; it has not been published as a verified event."
  ],
  "来源提供的正式发表 DOI": [
    "來源提供的正式發表 DOI",
    "Published DOI supplied by the source"
  ],
  "SOURCE RECORD · 原始记录": [
    "SOURCE RECORD · 原始記錄",
    "SOURCE RECORD"
  ],
  "· 来源日期": [
    "· 來源日期",
    "· Source date"
  ],
  "· 收录": [
    "· 收錄",
    "· Collected"
  ],
  " · BioAI 日知 · 问象": [
    " · BioAI 日知 · 問象",
    " · BioAI Daily · Wenxiang"
  ],
  "正在连接数据服务…": [
    "正在連接資料服務…",
    "Connecting to the data service…"
  ],
  "连接公司、历史主体、官方来源与发展进展。支持中英文、别名与历史品牌检索。": [
    "連接公司、歷史主體、官方來源與發展進展。支持中英文、別名與歷史品牌檢索。",
    "Explore companies, historical entities, official sources and updates. Search Chinese and English names, aliases and historical brands."
  ],
  "核验来源、审阅原文，将有证据的事件发布到全站。": [
    "覈驗來源、審閱原文，將有證據的事件發佈到全站。",
    "Verify sources, review records and publish evidence-backed events across the site."
  ],
  "BIOAI · 问象": [
    "BIOAI · 問象",
    "BIOAI · WENXIANG"
  ],
  "重试": [
    "重試",
    "Retry"
  ],
  "已复制": [
    "已複製",
    "Copied"
  ],
  "请复制上方地址": [
    "請複製上方地址",
    "Copy the address above"
  ],
  "全部栏目 ☰": [
    "全部欄目 ☰",
    "All sections ☰"
  ],
  "收起菜单 ×": [
    "收起菜單 ×",
    "Close menu ×"
  ],
  "公司、技术与一手信息源。主题筛选基于已收录的关联原文，不推断公司的技术能力。": [
    "公司、技術與一手資訊源。主題篩選基於已收錄的關聯原文，不推斷公司的技術能力。",
    "Companies, technology and first-hand sources. Topic filters use collected related records and do not infer a company's technical capabilities."
  ],
  "搜索中文名、英文名或历史别名": [
    "搜索中文名、英文名或歷史別名",
    "Chinese / English name or historical alias"
  ],
  "搜索公司": [
    "搜索公司",
    "Search companies"
  ],
  "公司类别": [
    "公司類別",
    "Company category"
  ],
  "全部公司类别": [
    "全部公司類別",
    "All company categories"
  ],
  "关联原文主题": [
    "關聯原文主題",
    "Related source topic"
  ],
  "全部关联主题": [
    "全部關聯主題",
    "All related topics"
  ],
  "地区与布局": [
    "地區與佈局",
    "Region & operations"
  ],
  "全部地区与布局": [
    "全部地區與佈局",
    "All regions & operations"
  ],
  "包含历史实体": [
    "包含歷史實體",
    "Include historical entities"
  ],
  "正在读取数据库…": [
    "正在讀取資料庫…",
    "Loading database…"
  ],
  "尚无官网": [
    "尚無官網",
    "No website recorded"
  ],
  "数据库服务暂不可用，请稍后重试。": [
    "資料庫服務暫不可用，請稍後重試。",
    "The database service is unavailable. Please try again later."
  ],
  "已关注": [
    "已關注",
    "Following"
  ],
  "关注": [
    "關注",
    "Follow"
  ],
  "尚无已核验事件": [
    "尚無已覈驗事件",
    "No verified events yet"
  ],
  "近 30 天": [
    "近 30 天",
    "Past 30 days:"
  ],
  "条已核验事件": [
    "條已覈驗事件",
    "verified events"
  ],
  "没有匹配的公司，试试其他名称或地区。": [
    "沒有匹配的公司，試試其他名稱或地區。",
    "No matching companies. Try another name or region."
  ],
  "家实体 · 关注仅保存在当前浏览器": [
    "家實體 · 關注僅保存在當前瀏覽器",
    "entities · follows are stored only in this browser"
  ],
  "官方网站": [
    "官方網站",
    "Official website"
  ],
  "暂未收录公司简介。": [
    "暫未收錄公司簡介。",
    "No company introduction recorded yet."
  ],
  "历史品牌 / ": [
    "歷史品牌 / ",
    "Historical brand / "
  ],
  "资料待复核": [
    "資料待複覈",
    "Awaiting review"
  ],
  "已复核": [
    "已複覈",
    "Reviewed"
  ],
  "待人工核验": [
    "待人工覈驗",
    "Awaiting manual verification"
  ],
  "归属记录：": [
    "歸屬記錄：",
    "Ownership record:"
  ],
  "尚无已核验进展。": [
    "尚無已覈驗進展。",
    "No verified updates yet."
  ],
  "· 查看事件证据": [
    "· 查看事件證據",
    "· View event evidence"
  ],
  "暂无附有证据的关系记录。": [
    "暫無附有證據的關係記錄。",
    "No evidence-backed relationship records yet."
  ],
  "尚无": [
    "尚無",
    "None yet"
  ],
  " · 需要复核": [
    " · 需要複覈",
    " · needs review"
  ],
  "最近成功：": [
    "最近成功：",
    "Last success:"
  ],
  "连续失败：": [
    "連續失敗：",
    "Consecutive failures:"
  ],
  "暂无来源。": [
    "暫無來源。",
    "No sources yet."
  ],
  "← 返回公司黄页": [
    "← 返回公司黃頁",
    "← Back to company directory"
  ],
  "公司档案与历史名称": [
    "公司檔案與歷史名稱",
    "Company profile & historical names"
  ],
  "独立进展时间线": [
    "獨立進展時間線",
    "Company timeline"
  ],
  "合作网络": [
    "合作網絡",
    "Partnership network"
  ],
  "相关药物、模型、数据集与论文": [
    "相關藥物、模型、資料集與論文",
    "Related drugs, models, datasets & papers"
  ],
  "相关实体与版本关联尚未接入。": [
    "相關實體與版本關聯尚未接入。",
    "Related entities and version links are not connected yet."
  ],
  "官方来源与健康状态": [
    "官方來源與健康狀態",
    "Official sources & health"
  ],
  "未验证的社交账号只在管理后台显示。": [
    "未驗證的社交賬號只在管理後臺顯示。",
    "Unverified social accounts appear only in the editorial workspace."
  ],
  "BioAI 日知 · 问象": [
    "BioAI 日知 · 問象",
    "BioAI Daily · Wenxiang"
  ],
  "语言": [
    "語言",
    "Language"
  ],
  "跳到内容": [
    "跳到內容",
    "Skip to content"
  ],
  "探索与发现": [
    "探索與發現",
    "Explore & discover"
  ],
  "主导航": [
    "主導航",
    "Main navigation"
  ],
  "问象观察站": [
    "問象觀察站",
    "Wenxiang Observatory"
  ],
  "今日概览": [
    "今日概覽",
    "Today's overview"
  ],
  "刷新当前数据": [
    "刷新當前資料",
    "Refresh current data"
  ],
  "信息来自可追溯原始来源 · 查看接入状态 ↗": [
    "資訊來自可追溯原始來源 · 查看接入狀態 ↗",
    "Traceable original sources · view connection status ↗"
  ],
  "访问统计与隐私说明": [
    "訪問統計與隱私說明",
    "Usage statistics & privacy"
  ],
  "本站用第一方统计了解哪些页面、原始出处与连接功能受到关注。统计记录仅含允许的页面路径、动作标识和来源域名，不含搜索词、表单内容、完整链接或原始 IP。": [
    "本站用第一方統計瞭解哪些頁面、原始出處與連接功能受到關注。統計記錄僅含允許的頁面路徑、動作標識和來源域名，不含搜索詞、表單內容、完整鏈接或原始 IP。",
    "This site uses first-party statistics to understand interest in pages, original sources and connection features. Records contain only allowed page paths, action identifiers and source domains, excluding search terms, form contents, full URLs and raw IP addresses."
  ],
  "匿名会话标识仅保存在当前标签页，30 分钟没有活动后更新，不代表独立人数。浏览器的 Do Not Track（DNT）或 Global Privacy Control（GPC）信号会停止网页事件采集；管理页面和管理操作不采集。": [
    "匿名會話標識僅保存在當前標籤頁，30 分鐘沒有活動後更新，不代表獨立人數。瀏覽器的 Do Not Track（DNT）或 Global Privacy Control（GPC）信號會停止網頁事件擷取；管理頁面和管理操作不擷取。",
    "An anonymous session identifier stays in this tab and resets after 30 minutes of inactivity. It does not represent unique people. Browser Do Not Track (DNT) or Global Privacy Control (GPC) signals stop web-event collection. Editorial pages and actions are excluded."
  ],
  "MCP 使用量由服务端实际执行的工具记录，网页复制按钮点击不会算作工具调用，也不证明复制成功。测试流量与按浏览器标识识别的自动化访问从网页统计排除，识别可能存在误差；统计事件保留 90 天。": [
    "MCP 使用量由服務端實際執行的工具記錄，網頁複製按鈕點擊不會算作工具調用，也不證明覆製成功。測試流量與按瀏覽器標識識別的自動化訪問從網頁統計排除，識別可能存在誤差；統計事件保留 90 天。",
    "MCP usage records actual tool execution on the server. Clicking a copy button is not a tool call and does not prove copying succeeded. Test traffic and automated visits detected by browser identifiers are excluded; detection may be imperfect. Statistics are retained for 90 days."
  ],
  "当前浏览器未发出 DNT / GPC 停止统计信号。": [
    "當前瀏覽器未發出 DNT / GPC 停止統計信號。",
    "This browser has not sent a DNT / GPC signal to stop statistics."
  ],
  "当前浏览器已发出 DNT / GPC 信号，网页事件不采集。": [
    "當前瀏覽器已發出 DNT / GPC 信號，網頁事件不擷取。",
    "This browser has sent a DNT / GPC signal. Web events are not collected."
  ],
  "事件证据与原文详情": [
    "事件證據與原文詳情",
    "Event evidence & original-source details"
  ],
  "关闭详情": [
    "關閉詳情",
    "Close details"
  ],
  "BioAI 日知 · 问象：追踪 AI 在生物医药领域的行业动态、融资合作与研究进展，连接公司黄页、重点赛道与可追溯原始来源。": [
    "BioAI 日知 · 問象：追蹤 AI 在生物醫藥領域的行業動態、融資合作與研究進展，連接公司黃頁、重點賽道與可追溯原始來源。",
    "BioAI Daily by Wenxiang follows AI in biopharma through industry news, funding, partnerships and research, connecting company profiles, research tracks and traceable original sources."
  ],
  "标题、摘要与证据保留原始来源语言。": [
    "標題、摘要與證據保留原始來源語言。",
    "Titles, abstracts and evidence remain in the original source language."
  ],
  "可选语言参数": [
    "可選語言參數",
    "Optional language parameter"
  ],
  "MCP 工具可传入 language：zh-CN、zh-Hant 或 en，用于界面标签与说明。标题、摘要和证据仍保留原文。": [
    "MCP 工具可傳入 language：zh-CN、zh-Hant 或 en，用於界面標籤與說明。標題、摘要和證據仍保留原文。",
    "MCP tools accept optional language: zh-CN, zh-Hant or en for labels and explanations. Titles, abstracts and evidence stay in their original language."
  ],
  "网络连接失败，请检查连接后重试。": [
    "網絡連接失敗，請檢查連接後重試。",
    "Network connection failed. Check your connection and try again."
  ],
  "查看公司档案": [
    "查看公司檔案",
    "View company profile"
  ],
  "公司数：{count} · 关注仅保存在当前浏览器": [
    "公司數：{count} · 關注僅保存在當前瀏覽器",
    "Entities: {count} · follows are stored only in this browser"
  ],
  "近 30 天已核验事件：{count}": [
    "近 30 天已覈驗事件：{count}",
    "Verified events in the past 30 days: {count}"
  ],
  "原文证据：{count}": [
    "原文證據：{count}",
    "Source evidence records: {count}"
  ],
  "证据：{count}": [
    "證據：{count}",
    "Evidence records: {count}"
  ],
  "公司：{count}": [
    "公司：{count}",
    "Companies: {count}"
  ],
  "连续失败：{count}": [
    "連續失敗：{count}",
    "Consecutive failures: {count}"
  ],
  "主题原文：{count} · 保留来源时间与收录时间 · 主题按关键词自动归类": [
    "主題原文：{count} · 保留來源時間與收錄時間 · 主題按關鍵詞自動歸類",
    "Source records: {count} · source and collection dates retained · topics classified by keywords"
  ],
  "匹配的已核验事件：{count} · 跨产业事件可在关联方向同时展示": [
    "匹配的已覈驗事件：{count} · 跨產業事件可在關聯方向同時展示",
    "Matching verified events: {count} · cross-industry events may appear in multiple tracks"
  ],
  "公司：{companies} · 关系：{relations}": [
    "公司：{companies} · 關係：{relations}",
    "Companies: {companies} · relationships: {relations}"
  ],
  "来源：{count}": [
    "來源：{count}",
    "Sources: {count}"
  ],
  "{label}：{count} · 展示实际收录的原始资料": [
    "{label}：{count} · 展示實際收錄的原始資料",
    "{label}: {count} · displaying source material actually collected"
  ],
  "收录期刊与筛选规则 · 重点期刊：{count}": [
    "收錄期刊與篩選規則 · 重點期刊：{count}",
    "Journal list & selection rules · selected journals: {count}"
  ],
  "窗口 {start} — {end} · 当前公开：{count} 条（最多选入 100 条）": [
    "窗口 {start} — {end} · 當前公開：{count} 條（最多選入 100 條）",
    "Window {start} — {end} · public records: {count} (up to 100 selected)"
  ],
  "已导出关注名单。公司数：{count}。请在另一台设备的“我的关注”导入此文件。": [
    "已導出關注名單。公司數：{count}。請在另一臺設備的“我的關注”導入此文件。",
    "Watchlist exported. Companies: {count}. Import this file into “My watchlist” on your other device."
  ],
  "导入完成，新增公司：{added}{skipped}。现有关注已保留。": [
    "導入完成，新增公司：{added}{skipped}。現有關注已保留。",
    "Import complete. Companies added: {added}{skipped}. Existing follows were retained."
  ],
  "；跳过未匹配名称：{count}": [
    "；跳過未匹配名稱：{count}",
    "; unmatched entries skipped: {count}"
  ]
};
  const labels = {
  "AI临床开发": [
    "AI临床开发",
    "AI臨牀開發",
    "AI clinical development"
  ],
  "AI制剂": [
    "AI制剂",
    "AI製劑",
    "AI formulation"
  ],
  "AI制药": [
    "AI制药",
    "AI製藥",
    "AI drug discovery"
  ],
  "AI小分子": [
    "AI小分子",
    "AI小分子",
    "AI small molecules"
  ],
  "AI小分子发现": [
    "AI小分子发现",
    "AI小分子發現",
    "AI small-molecule discovery"
  ],
  "AI药物发现": [
    "AI药物发现",
    "AI藥物發現",
    "AI drug discovery"
  ],
  "AI药物研发": [
    "AI药物研发",
    "AI藥物研發",
    "AI drug R&D"
  ],
  "AI药物设计": [
    "AI药物设计",
    "AI藥物設計",
    "AI drug design"
  ],
  "AI蛋白设计": [
    "AI蛋白设计",
    "AI蛋白設計",
    "AI protein design"
  ],
  "AI计算平台": [
    "AI计算平台",
    "AI計算平臺",
    "AI computing platform"
  ],
  "AI诊断": [
    "AI诊断",
    "AI診斷",
    "AI diagnostics"
  ],
  "AI遗传学": [
    "AI遗传学",
    "AI遺傳學",
    "AI genetics"
  ],
  "AVITI平台": [
    "AVITI平台",
    "AVITI平臺",
    "AVITI platform"
  ],
  "HiFi测序": [
    "HiFi测序",
    "HiFi測序",
    "HiFi sequencing"
  ],
  "RNA药物": [
    "RNA药物",
    "RNA藥物",
    "RNA therapeutics"
  ],
  "临床基因组": [
    "临床基因组",
    "臨牀基因組",
    "Clinical genomics"
  ],
  "临床开发": [
    "临床开发",
    "臨牀開發",
    "Clinical development"
  ],
  "临床数据": [
    "临床数据",
    "臨牀資料",
    "Clinical data"
  ],
  "临床检测": [
    "临床检测",
    "臨牀檢測",
    "Clinical testing"
  ],
  "临床管线": [
    "临床管线",
    "臨牀管線",
    "Clinical pipeline"
  ],
  "临床试验": [
    "临床试验",
    "臨牀試驗",
    "Clinical trials"
  ],
  "临床转化": [
    "临床转化",
    "臨牀轉化",
    "Clinical translation"
  ],
  "人体相关体外药物评价模型": [
    "人体相关体外药物评价模型",
    "人體相關體外藥物評價模型",
    "Human-relevant in vitro drug evaluation models"
  ],
  "人源数据": [
    "人源数据",
    "人源資料",
    "Human-derived data"
  ],
  "人源组学": [
    "人源组学",
    "人源組學",
    "Human omics"
  ],
  "代谢": [
    "代谢",
    "代謝",
    "Metabolism"
  ],
  "代谢与免疫": [
    "代谢与免疫",
    "代謝與免疫",
    "Metabolism & immunity"
  ],
  "伴随诊断": [
    "伴随诊断",
    "伴隨診斷",
    "Companion diagnostics"
  ],
  "低成本测序": [
    "低成本测序",
    "低成本測序",
    "Low-cost sequencing"
  ],
  "免疫": [
    "免疫",
    "免疫",
    "Immunology"
  ],
  "免疫单细胞数据": [
    "免疫单细胞数据",
    "免疫單細胞資料",
    "Immune single-cell data"
  ],
  "全球临床开发": [
    "全球临床开发",
    "全球臨牀開發",
    "Global clinical development"
  ],
  "凋亡通路": [
    "凋亡通路",
    "凋亡通路",
    "Apoptosis pathways"
  ],
  "分子结构预测": [
    "分子结构预测",
    "分子結構預測",
    "Molecular structure prediction"
  ],
  "分子设计": [
    "分子设计",
    "分子設計",
    "Molecular design"
  ],
  "分子诊断": [
    "分子诊断",
    "分子診斷",
    "Molecular diagnostics"
  ],
  "创新药": [
    "创新药",
    "創新藥",
    "Innovative medicines"
  ],
  "制剂": [
    "制剂",
    "製劑",
    "Formulation"
  ],
  "制药": [
    "制药",
    "製藥",
    "Pharmaceuticals"
  ],
  "动物保健": [
    "动物保健",
    "動物保健",
    "Animal health"
  ],
  "医疗器械": [
    "医疗器械",
    "醫療器械",
    "Medical devices"
  ],
  "医疗服务": [
    "医疗服务",
    "醫療服務",
    "Healthcare services"
  ],
  "单分子蛋白测序": [
    "单分子蛋白测序",
    "單分子蛋白測序",
    "Single-molecule protein sequencing"
  ],
  "单分子蛋白组": [
    "单分子蛋白组",
    "單分子蛋白組",
    "Single-molecule proteomics"
  ],
  "单细胞DNA测序": [
    "单细胞DNA测序",
    "單細胞DNA測序",
    "Single-cell DNA sequencing"
  ],
  "单细胞微流控": [
    "单细胞微流控",
    "單細胞微流控",
    "Single-cell microfluidics"
  ],
  "单细胞扰动数据": [
    "单细胞扰动数据",
    "單細胞擾動資料",
    "Single-cell perturbation data"
  ],
  "单细胞数据": [
    "单细胞数据",
    "單細胞資料",
    "Single-cell data"
  ],
  "单细胞测序": [
    "单细胞测序",
    "單細胞測序",
    "Single-cell sequencing"
  ],
  "单细胞组学": [
    "单细胞组学",
    "單細胞組學",
    "Single-cell omics"
  ],
  "原位成像": [
    "原位成像",
    "原位成像",
    "In situ imaging"
  ],
  "双特异抗体": [
    "双特异抗体",
    "雙特異抗體",
    "Bispecific antibodies"
  ],
  "合成生物学平台": [
    "合成生物学平台",
    "合成生物學平臺",
    "Synthetic biology platform"
  ],
  "呼吸": [
    "呼吸",
    "呼吸",
    "Respiratory"
  ],
  "呼吸免疫": [
    "呼吸免疫",
    "呼吸免疫",
    "Respiratory immunology"
  ],
  "器官芯片": [
    "器官芯片",
    "器官芯片",
    "Organ-on-chip"
  ],
  "囊性纤维化": [
    "囊性纤维化",
    "囊性纖維化",
    "Cystic fibrosis"
  ],
  "基因合成": [
    "基因合成",
    "基因合成",
    "Gene synthesis"
  ],
  "基因检测": [
    "基因检测",
    "基因檢測",
    "Genetic testing"
  ],
  "基因治疗": [
    "基因治疗",
    "基因治療",
    "Gene therapy"
  ],
  "基因测序": [
    "基因测序",
    "基因測序",
    "Gene sequencing"
  ],
  "基因组学": [
    "基因组学",
    "基因組學",
    "Genomics"
  ],
  "基因组测序": [
    "基因组测序",
    "基因組測序",
    "Genome sequencing"
  ],
  "基因编辑": [
    "基因编辑",
    "基因編輯",
    "Gene editing"
  ],
  "基因编辑模型": [
    "基因编辑模型",
    "基因編輯模型",
    "Gene-editing models"
  ],
  "多模态生物医学AI": [
    "多模态生物医学AI",
    "多模態生物醫學AI",
    "Multimodal biomedical AI"
  ],
  "多组学AI": [
    "多组学AI",
    "多組學AI",
    "Multiomics AI"
  ],
  "多组学服务": [
    "多组学服务",
    "多組學服務",
    "Multiomics services"
  ],
  "天然产物": [
    "天然产物",
    "天然產物",
    "Natural products"
  ],
  "女性健康": [
    "女性健康",
    "女性健康",
    "Women's health"
  ],
  "实时长读长": [
    "实时长读长",
    "實時長讀長",
    "Real-time long reads"
  ],
  "实验数据平台": [
    "实验数据平台",
    "實驗資料平臺",
    "Experimental data platform"
  ],
  "实验设计智能": [
    "实验设计智能",
    "實驗設計智能",
    "Intelligent experiment design"
  ],
  "小分子发现": [
    "小分子发现",
    "小分子發現",
    "Small-molecule discovery"
  ],
  "小分子药物": [
    "小分子药物",
    "小分子藥物",
    "Small-molecule drugs"
  ],
  "小分子设计": [
    "小分子设计",
    "小分子設計",
    "Small-molecule design"
  ],
  "开发与生产": [
    "开发与生产",
    "開發與生產",
    "Development & manufacturing"
  ],
  "微流控": [
    "微流控",
    "微流控",
    "Microfluidics"
  ],
  "微生物组": [
    "微生物组",
    "微生物組",
    "Microbiome"
  ],
  "心肾代谢": [
    "心肾代谢",
    "心腎代謝",
    "Cardiorenal metabolism"
  ],
  "心血管": [
    "心血管",
    "心血管",
    "Cardiovascular"
  ],
  "感染": [
    "感染",
    "感染",
    "Infectious disease"
  ],
  "成像组学": [
    "成像组学",
    "成像組學",
    "Imaging omics"
  ],
  "抗体": [
    "抗体",
    "抗體",
    "Antibodies"
  ],
  "抗体偶联药物": [
    "抗体偶联药物",
    "抗體偶聯藥物",
    "Antibody-drug conjugates"
  ],
  "抗体发现": [
    "抗体发现",
    "抗體發現",
    "Antibody discovery"
  ],
  "抗体发现平台": [
    "抗体发现平台",
    "抗體發現平臺",
    "Antibody discovery platform"
  ],
  "抗体工程": [
    "抗体工程",
    "抗體工程",
    "Antibody engineering"
  ],
  "抗体生产": [
    "抗体生产",
    "抗體生產",
    "Antibody manufacturing"
  ],
  "抗体药物": [
    "抗体药物",
    "抗體藥物",
    "Antibody therapeutics"
  ],
  "抗体设计": [
    "抗体设计",
    "抗體設計",
    "Antibody design"
  ],
  "抗病毒": [
    "抗病毒",
    "抗病毒",
    "Antivirals"
  ],
  "放射配体": [
    "放射配体",
    "放射配體",
    "Radioligands"
  ],
  "数字病理": [
    "数字病理",
    "數字病理",
    "Digital pathology"
  ],
  "无创产前检测": [
    "无创产前检测",
    "無創產前檢測",
    "Non-invasive prenatal testing"
  ],
  "时空组学": [
    "时空组学",
    "時空組學",
    "Spatiotemporal omics"
  ],
  "晶型预测": [
    "晶型预测",
    "晶型預測",
    "Crystal form prediction"
  ],
  "机器人实验室": [
    "机器人实验室",
    "機器人實驗室",
    "Robotic laboratory"
  ],
  "机器学习实验闭环": [
    "机器学习实验闭环",
    "機器學習實驗閉環",
    "Closed-loop machine-learning experiments"
  ],
  "机器学习平台": [
    "机器学习平台",
    "機器學習平臺",
    "Machine-learning platform"
  ],
  "机器学习药物发现": [
    "机器学习药物发现",
    "機器學習藥物發現",
    "Machine-learning drug discovery"
  ],
  "材料与分子模拟": [
    "材料与分子模拟",
    "材料與分子模擬",
    "Materials & molecular simulation"
  ],
  "检测平台": [
    "检测平台",
    "檢測平臺",
    "Testing platform"
  ],
  "泌尿": [
    "泌尿",
    "泌尿",
    "Urology"
  ],
  "测序仪": [
    "测序仪",
    "測序儀",
    "Sequencers"
  ],
  "测序平台": [
    "测序平台",
    "測序平臺",
    "Sequencing platforms"
  ],
  "测序建库": [
    "测序建库",
    "測序建庫",
    "Sequencing library preparation"
  ],
  "测序服务": [
    "测序服务",
    "測序服務",
    "Sequencing services"
  ],
  "消化": [
    "消化",
    "消化",
    "Gastroenterology"
  ],
  "液体活检": [
    "液体活检",
    "液體活檢",
    "Liquid biopsy"
  ],
  "深度学习虚拟筛选": [
    "深度学习虚拟筛选",
    "深度學習虛擬篩選",
    "Deep-learning virtual screening"
  ],
  "深度蛋白组": [
    "深度蛋白组",
    "深度蛋白組",
    "Deep proteomics"
  ],
  "炎症": [
    "炎症",
    "炎症",
    "Inflammation"
  ],
  "生命数字化": [
    "生命数字化",
    "生命數字化",
    "Digitizing life"
  ],
  "生命科学AI基础设施": [
    "生命科学AI基础设施",
    "生命科學AI基礎設施",
    "Life-science AI infrastructure"
  ],
  "生命科学基础模型": [
    "生命科学基础模型",
    "生命科學基礎模型",
    "Life-science foundation models"
  ],
  "生命科学试剂": [
    "生命科学试剂",
    "生命科學試劑",
    "Life-science reagents"
  ],
  "生成式AI": [
    "生成式AI",
    "生成式AI",
    "Generative AI"
  ],
  "生成式AI制药": [
    "生成式AI制药",
    "生成式AI製藥",
    "Generative AI drug discovery"
  ],
  "生成式RNA设计": [
    "生成式RNA设计",
    "生成式RNA設計",
    "Generative RNA design"
  ],
  "生成式化学": [
    "生成式化学",
    "生成式化學",
    "Generative chemistry"
  ],
  "生成式抗体设计": [
    "生成式抗体设计",
    "生成式抗體設計",
    "Generative antibody design"
  ],
  "生成式模型": [
    "生成式模型",
    "生成式模型",
    "Generative models"
  ],
  "生成式生物学": [
    "生成式生物学",
    "生成式生物學",
    "Generative biology"
  ],
  "生成式蛋白设计": [
    "生成式蛋白设计",
    "生成式蛋白設計",
    "Generative protein design"
  ],
  "生成模型": [
    "生成模型",
    "生成模型",
    "Generative models"
  ],
  "生物信息": [
    "生物信息",
    "生物資訊",
    "Bioinformatics"
  ],
  "生物医学知识图谱": [
    "生物医学知识图谱",
    "生物醫學知識圖譜",
    "Biomedical knowledge graphs"
  ],
  "生物数据": [
    "生物数据",
    "生物資料",
    "Biological data"
  ],
  "生物芯片": [
    "生物芯片",
    "生物芯片",
    "Biochips"
  ],
  "生物药": [
    "生物药",
    "生物藥",
    "Biologics"
  ],
  "生物药CRDMO": [
    "生物药CRDMO",
    "生物藥CRDMO",
    "Biologics CRDMO"
  ],
  "生育健康": [
    "生育健康",
    "生育健康",
    "Reproductive health"
  ],
  "疫苗": [
    "疫苗",
    "疫苗",
    "Vaccines"
  ],
  "疾病模型": [
    "疾病模型",
    "疾病模型",
    "Disease models"
  ],
  "疾病生物学": [
    "疾病生物学",
    "疾病生物學",
    "Disease biology"
  ],
  "眼科": [
    "眼科",
    "眼科",
    "Ophthalmology"
  ],
  "知识图谱": [
    "知识图谱",
    "知識圖譜",
    "Knowledge graphs"
  ],
  "短读长测序": [
    "短读长测序",
    "短讀長測序",
    "Short-read sequencing"
  ],
  "神经科学": [
    "神经科学",
    "神經科學",
    "Neuroscience"
  ],
  "神经退行性疾病": [
    "神经退行性疾病",
    "神經退行性疾病",
    "Neurodegenerative diseases"
  ],
  "科学计算": [
    "科学计算",
    "科學計算",
    "Scientific computing"
  ],
  "科学超级智能": [
    "科学超级智能",
    "科學超級智能",
    "Scientific superintelligence"
  ],
  "科研智能": [
    "科研智能",
    "科研智能",
    "Research intelligence"
  ],
  "科研服务": [
    "科研服务",
    "科研服務",
    "Research services"
  ],
  "移植检测": [
    "移植检测",
    "移植檢測",
    "Transplant testing"
  ],
  "空间与单细胞": [
    "空间与单细胞",
    "空間與單細胞",
    "Spatial & single-cell"
  ],
  "空间生物学": [
    "空间生物学",
    "空間生物學",
    "Spatial biology"
  ],
  "空间组学": [
    "空间组学",
    "空間組學",
    "Spatial omics"
  ],
  "空间蛋白组": [
    "空间蛋白组",
    "空間蛋白組",
    "Spatial proteomics"
  ],
  "空间转录组": [
    "空间转录组",
    "空間轉錄組",
    "Spatial transcriptomics"
  ],
  "精准医疗": [
    "精准医疗",
    "精準醫療",
    "Precision medicine"
  ],
  "糖尿病": [
    "糖尿病",
    "糖尿病",
    "Diabetes"
  ],
  "纳米孔测序": [
    "纳米孔测序",
    "納米孔測序",
    "Nanopore sequencing"
  ],
  "组合索引单细胞": [
    "组合索引单细胞",
    "組合索引單細胞",
    "Combinatorial-indexing single-cell"
  ],
  "细胞基因治疗试剂": [
    "细胞基因治疗试剂",
    "細胞基因治療試劑",
    "Cell & gene therapy reagents"
  ],
  "细胞治疗": [
    "细胞治疗",
    "細胞治療",
    "Cell therapy"
  ],
  "细胞治疗服务": [
    "细胞治疗服务",
    "細胞治療服務",
    "Cell therapy services"
  ],
  "细胞状态预测模型": [
    "细胞状态预测模型",
    "細胞狀態預測模型",
    "Cell-state prediction models"
  ],
  "罕见病": [
    "罕见病",
    "罕見病",
    "Rare diseases"
  ],
  "联邦学习": [
    "联邦学习",
    "聯邦學習",
    "Federated learning"
  ],
  "肝病": [
    "肝病",
    "肝病",
    "Liver disease"
  ],
  "肥胖": [
    "肥胖",
    "肥胖",
    "Obesity"
  ],
  "育种": [
    "育种",
    "育種",
    "Breeding"
  ],
  "肿瘤": [
    "肿瘤",
    "腫瘤",
    "Oncology"
  ],
  "肿瘤NGS": [
    "肿瘤NGS",
    "腫瘤NGS",
    "Oncology NGS"
  ],
  "肿瘤与心血管": [
    "肿瘤与心血管",
    "腫瘤與心血管",
    "Oncology & cardiovascular"
  ],
  "肿瘤免疫": [
    "肿瘤免疫",
    "腫瘤免疫",
    "Tumor immunology"
  ],
  "肿瘤基因检测": [
    "肿瘤基因检测",
    "腫瘤基因檢測",
    "Tumor genetic testing"
  ],
  "肿瘤小分子": [
    "肿瘤小分子",
    "腫瘤小分子",
    "Oncology small molecules"
  ],
  "肿瘤早筛": [
    "肿瘤早筛",
    "腫瘤早篩",
    "Early cancer screening"
  ],
  "肿瘤检测": [
    "肿瘤检测",
    "腫瘤檢測",
    "Cancer testing"
  ],
  "肿瘤精准医疗": [
    "肿瘤精准医疗",
    "腫瘤精準醫療",
    "Precision oncology"
  ],
  "肿瘤精准治疗": [
    "肿瘤精准治疗",
    "腫瘤精準治療",
    "Precision cancer therapy"
  ],
  "肿瘤药物": [
    "肿瘤药物",
    "腫瘤藥物",
    "Oncology drugs"
  ],
  "自动化与数据": [
    "自动化与数据",
    "自動化與資料",
    "Automation & data"
  ],
  "自动化实验": [
    "自动化实验",
    "自動化實驗",
    "Automated experiments"
  ],
  "自动化平台": [
    "自动化平台",
    "自動化平臺",
    "Automation platforms"
  ],
  "自研管线": [
    "自研管线",
    "自研管線",
    "In-house pipeline"
  ],
  "自身免疫": [
    "自身免疫",
    "自身免疫",
    "Autoimmunity"
  ],
  "药物发现": [
    "药物发现",
    "藥物發現",
    "Drug discovery"
  ],
  "药物发现与开发": [
    "药物发现与开发",
    "藥物發現與開發",
    "Drug discovery & development"
  ],
  "药物发现软件": [
    "药物发现软件",
    "藥物發現軟體",
    "Drug discovery software"
  ],
  "药物开发": [
    "药物开发",
    "藥物開發",
    "Drug development"
  ],
  "药物设计": [
    "药物设计",
    "藥物設計",
    "Drug design"
  ],
  "药物资产开发": [
    "药物资产开发",
    "藥物資產開發",
    "Drug asset development"
  ],
  "蛋白与抗体": [
    "蛋白与抗体",
    "蛋白與抗體",
    "Proteins & antibodies"
  ],
  "蛋白互作数据": [
    "蛋白互作数据",
    "蛋白互作資料",
    "Protein interaction data"
  ],
  "蛋白工程": [
    "蛋白工程",
    "蛋白工程",
    "Protein engineering"
  ],
  "蛋白结构": [
    "蛋白结构",
    "蛋白結構",
    "Protein structure"
  ],
  "蛋白表达": [
    "蛋白表达",
    "蛋白表達",
    "Protein expression"
  ],
  "蛋白设计": [
    "蛋白设计",
    "蛋白設計",
    "Protein design"
  ],
  "蛋白质基础模型": [
    "蛋白质基础模型",
    "蛋白質基礎模型",
    "Protein foundation models"
  ],
  "蛋白质组平台": [
    "蛋白质组平台",
    "蛋白質組平臺",
    "Proteomics platforms"
  ],
  "血浆疗法": [
    "血浆疗法",
    "血漿療法",
    "Plasma therapies"
  ],
  "血液肿瘤": [
    "血液肿瘤",
    "血液腫瘤",
    "Hematologic cancers"
  ],
  "表型组学": [
    "表型组学",
    "表型組學",
    "Phenomics"
  ],
  "计算化学": [
    "计算化学",
    "計算化學",
    "Computational chemistry"
  ],
  "诊断": [
    "诊断",
    "診斷",
    "Diagnostics"
  ],
  "质谱流式": [
    "质谱流式",
    "質譜流式",
    "Mass cytometry"
  ],
  "超灵敏蛋白检测": [
    "超灵敏蛋白检测",
    "超靈敏蛋白檢測",
    "Ultrasensitive protein detection"
  ],
  "转录组": [
    "转录组",
    "轉錄組",
    "Transcriptomics"
  ],
  "递送系统": [
    "递送系统",
    "遞送系統",
    "Delivery systems"
  ],
  "遗传学": [
    "遗传学",
    "遺傳學",
    "Genetics"
  ],
  "遗传检测": [
    "遗传检测",
    "遺傳檢測",
    "Genetic testing"
  ],
  "重组蛋白": [
    "重组蛋白",
    "重組蛋白",
    "Recombinant proteins"
  ],
  "量子启发药物设计": [
    "量子启发药物设计",
    "量子啓發藥物設計",
    "Quantum-inspired drug design"
  ],
  "长读长测序": [
    "长读长测序",
    "長讀長測序",
    "Long-read sequencing"
  ],
  "靶向蛋白组": [
    "靶向蛋白组",
    "靶向蛋白組",
    "Targeted proteomics"
  ],
  "靶向蛋白降解": [
    "靶向蛋白降解",
    "靶向蛋白降解",
    "Targeted protein degradation"
  ],
  "靶点发现": [
    "靶点发现",
    "靶點發現",
    "Target discovery"
  ],
  "高通量单细胞": [
    "高通量单细胞",
    "高通量單細胞",
    "High-throughput single-cell"
  ],
  "高通量测序": [
    "高通量测序",
    "高通量測序",
    "High-throughput sequencing"
  ],
  "高通量筛选": [
    "高通量筛选",
    "高通量篩選",
    "High-throughput screening"
  ],
  "高通量蛋白组": [
    "高通量蛋白组",
    "高通量蛋白組",
    "High-throughput proteomics"
  ],
  "中国": [
    "中国",
    "中國",
    "China"
  ],
  "中国大陆": [
    "中国大陆",
    "中國大陸",
    "Mainland China"
  ],
  "中国香港": [
    "中国香港",
    "中國香港",
    "Hong Kong, China"
  ],
  "全球": [
    "全球",
    "全球",
    "Global"
  ],
  "加拿大": [
    "加拿大",
    "加拿大",
    "Canada"
  ],
  "丹麦": [
    "丹麦",
    "丹麥",
    "Denmark"
  ],
  "德国": [
    "德国",
    "德國",
    "Germany"
  ],
  "日本": [
    "日本",
    "日本",
    "Japan"
  ],
  "法国": [
    "法国",
    "法國",
    "France"
  ],
  "瑞典": [
    "瑞典",
    "瑞典",
    "Sweden"
  ],
  "瑞士": [
    "瑞士",
    "瑞士",
    "Switzerland"
  ],
  "美国": [
    "美国",
    "美國",
    "United States"
  ],
  "英国": [
    "英国",
    "英國",
    "United Kingdom"
  ],
  "荷兰": [
    "荷兰",
    "荷蘭",
    "Netherlands"
  ],
  "以色列": [
    "以色列",
    "以色列",
    "Israel"
  ],
  "新加坡": [
    "新加坡",
    "新加坡",
    "Singapore"
  ],
  "active": [
    "运营中",
    "運營中",
    "Active"
  ],
  "inactive": [
    "已停用",
    "已停用",
    "Inactive"
  ],
  "historical": [
    "历史实体",
    "歷史實體",
    "Historical entity"
  ],
  "acquired": [
    "已被收购",
    "已被收購",
    "Acquired"
  ],
  "merged": [
    "已合并",
    "已合併",
    "Merged"
  ],
  "pending": [
    "待验证",
    "待驗證",
    "Pending verification"
  ],
  "verified": [
    "已验证",
    "已驗證",
    "Verified"
  ],
  "rejected": [
    "已拒绝",
    "已拒絕",
    "Rejected"
  ],
  "seed_unverified": [
    "资料待复核",
    "資料待複覈",
    "Awaiting review"
  ],
  "reviewed": [
    "已复核",
    "已複覈",
    "Reviewed"
  ],
  "collaborates_with": [
    "合作",
    "合作",
    "Collaborates with"
  ],
  "invests_in": [
    "投资",
    "投資",
    "Invests in"
  ],
  "acquires": [
    "收购",
    "收購",
    "Acquires"
  ],
  "licenses_from": [
    "获得授权",
    "獲得授權",
    "Licenses from"
  ],
  "co_develops": [
    "共同开发",
    "共同開發",
    "Co-develops"
  ],
  "adopts_platform": [
    "采用平台",
    "採用平臺",
    "Adopts platform"
  ],
  "co_publishes": [
    "共同发表",
    "共同發表",
    "Co-publishes"
  ],
  "测序与多组学": [
    "测序与多组学",
    "測序與多組學",
    "Sequencing & multiomics"
  ],
  "生物医药": [
    "生物医药",
    "生物醫藥",
    "Biopharma"
  ],
  "AI与模型数据": [
    "AI与模型数据",
    "AI與模型資料",
    "AI, models & data"
  ],
  "学术进展": [
    "学术进展",
    "學術進展",
    "Research updates"
  ],
  "融资": [
    "融资",
    "融資",
    "Funding"
  ],
  "合作": [
    "合作",
    "合作",
    "Partnership"
  ],
  "并购": [
    "并购",
    "併購",
    "Acquisition"
  ],
  "授权": [
    "授权",
    "授權",
    "Licensing"
  ],
  "产品发布": [
    "产品发布",
    "產品發佈",
    "Product launch"
  ],
  "临床进展": [
    "临床进展",
    "臨牀進展",
    "Clinical progress"
  ],
  "监管": [
    "监管",
    "監管",
    "Regulatory"
  ],
  "战略布局": [
    "战略布局",
    "戰略佈局",
    "Strategy"
  ],
  "论文": [
    "论文",
    "論文",
    "Paper"
  ],
  "模型": [
    "模型",
    "模型",
    "Model"
  ],
  "数据集": [
    "数据集",
    "資料集",
    "Dataset"
  ],
  "其他进展": [
    "其他进展",
    "其他進展",
    "Other progress"
  ],
  "投资": [
    "投资",
    "投資",
    "Investment"
  ],
  "收购": [
    "收购",
    "收購",
    "Acquires"
  ],
  "获得授权": [
    "获得授权",
    "獲得授權",
    "Licenses from"
  ],
  "共同开发": [
    "共同开发",
    "共同開發",
    "Co-develops"
  ],
  "采用平台": [
    "采用平台",
    "採用平臺",
    "Adopts platform"
  ],
  "共同发表": [
    "共同发表",
    "共同發表",
    "Co-publishes"
  ]
};

  function createLocale(env) {
    const valid = value => supportedLanguages.includes(value);
    const serverLanguage = env.document?.documentElement?.lang || "zh-CN";
    let stored;
    try { stored = env.localStorage.getItem(STORAGE_KEY); } catch { /* Storage is optional. */ }
    const explicit = new URLSearchParams(env.location.search).get("lang");
    let language = valid(explicit) ? explicit : valid(stored) ? stored : "zh-CN";
    const locale = () => ({"zh-CN": "zh-CN", "zh-Hant": "zh-Hant", en: "en-US"})[language];
    function t(key, variables = {}) {
      const entry = messages[key];
      const value = entry && language !== "zh-CN" ? entry[language === "en" ? 1 : 0] : String(key ?? "");
      return value.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(variables, name) ? String(variables[name]) : match);
    }
    function label(value) {
      const key = String(value ?? "");
      const entry = labels[key];
      if (entry) return entry[language === "en" ? 2 : language === "zh-Hant" ? 1 : 0];
      if (key.includes("/") && key.split("/").every(part => labels[part])) return key.split("/").map(label).join(language === "zh-CN" ? "/" : " / ");
      return key;
    }
    function companyName(company) {
      if (!company) return "";
      return language === "en"
        ? company.name_en || company.company_name_en || company.name_zh || company.name || company.company_name || ""
        : company.name_zh || company.company_name || company.name || company.name_en || company.company_name_en || "";
    }
    function date(value, full = false, options = {}) {
      if (!value) return t("日期未提供");
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) return t("日期待核验");
      return d.toLocaleString(locale(), {...(full ? {month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"} : {year: "numeric", month: "2-digit", day: "2-digit"}), timeZone: "Asia/Shanghai", ...options});
    }
    function url(value) {
      if (!value || String(value).startsWith("#")) return value;
      try {
        const parsed = new URL(value, env.location.href || env.location.origin + env.location.pathname + env.location.search);
        if (!/^https?:$/.test(parsed.protocol)) return value;
        if (parsed.hostname === "wanxiang-shengyuan.pages.dev") {
          const suffix = parsed.pathname.replace(/^\/(?:en|zh-hant)(?=\/|$)/, "");
          parsed.pathname = (language === "en" ? "/en" : language === "zh-Hant" ? "/zh-hant" : "") + (suffix || "/");
          parsed.searchParams.delete("lang");
          return parsed.href;
        }
        if (parsed.origin !== env.location.origin || parsed.pathname === "/mcp") return value;
        parsed.searchParams.set("lang", language);
        return String(value).startsWith("/") ? parsed.pathname + parsed.search + parsed.hash : parsed.href;
      } catch { return value; }
    }
    function control(id = "site-language") {
      return `<label class="language-control" for="${id}"><span class="visually-hidden">${t("语言")}</span><select id="${id}" data-language-select aria-label="${t("语言")}">${[["zh-CN", "简体中文"], ["zh-Hant", "繁體中文"], ["en", "English"]].map(([value, name]) => `<option value="${value}"${value === language ? " selected" : ""}>${name}</option>`).join("")}</select></label>`;
    }
    function apply(root = env.document) {
      if (!root?.querySelectorAll) return;
      for (const element of root.querySelectorAll("[data-i18n]")) {
        const text = t(element.getAttribute("data-i18n"));
        const mode = element.getAttribute("data-i18n-mode");
        if (mode) {
          const nodes = Array.from(element.childNodes).filter(node => node.nodeType === 3 && node.textContent.trim());
          const node = mode === "first" ? nodes[0] : nodes.at(-1);
          if (node) node.textContent = (mode === "tail" ? " " : "") + text;
        } else element.textContent = text;
      }
      for (const attribute of ["aria-label", "alt", "placeholder", "content"]) {
        for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
      }
      for (const select of root.querySelectorAll("[data-language-select]")) {
        select.value = language;
        select.setAttribute("aria-label", t("语言"));
      }
      if (env.document?.documentElement) {
        env.document.documentElement.lang = language;
        env.document.documentElement.dataset.language = language;
      }
    }
    function updateLinks(root = env.document) {
      if (!root?.querySelectorAll) return;
      for (const link of root.querySelectorAll("a[href]")) {
        if (link.closest?.("#admin-root")) continue;
        const old = link.getAttribute("href"), next = url(old);
        if (next !== old) link.setAttribute("href", next);
      }
      for (const element of root.querySelectorAll("[data-copy]")) {
        if (!element.closest?.("#admin-root")) {
          const next = url(element.dataset.copy);
          if (next !== element.dataset.copy) element.dataset.copy = next;
        }
      }
    }
    const serverRoute = () => !env.location.hash && (env.location.pathname === "/" || /^\/(?:guides(?:\/[^/]+)?|briefings|topics\/[^/]+|companies\/[^/]+|records\/[^/]+|events\/[^/]+|digest\/[^/]+|connect)\/?$/.test(env.location.pathname));
    function setLanguage(next) {
      if (!valid(next) || next === language) return;
      language = next;
      try { env.localStorage.setItem(STORAGE_KEY, next); } catch { /* URL selection still works. */ }
      const nextURL = new URL(env.location.href);
      nextURL.searchParams.set("lang", next);
      if (serverRoute()) { env.location.assign(nextURL.href); return; }
      env.history.replaceState(env.history.state, "", nextURL.href);
      apply(); updateLinks();
      env.dispatchEvent(new env.CustomEvent("bioai-languagechange", {detail: {language}}));
    }
    function init() {
      const nextURL = new URL(env.location.href);
      nextURL.searchParams.set("lang", language);
      if (serverRoute() && serverLanguage !== language) { env.location.replace(nextURL.href); return; }
      env.history.replaceState(env.history.state, "", nextURL.href);
      apply(); updateLinks();
      env.document.addEventListener("change", event => { if (event.target.matches?.("[data-language-select]")) setLanguage(event.target.value); });
      if (env.MutationObserver) new env.MutationObserver(() => updateLinks()).observe(env.document.body, {childList: true, subtree: true});
      env.addEventListener("popstate", () => {
        const value = new URLSearchParams(env.location.search).get("lang");
        if (valid(value) && value !== language) setLanguage(value);
      });
    }
    return {get language() { return language; }, get locale() { return locale(); }, serverLanguage, t, label, companyName, date, url, control, apply, updateLinks, setLanguage, init};
  }
  if (typeof module !== "undefined" && module.exports) module.exports = {createLocale, supportedLanguages, messages, labels};
  else { global.BioAILocale = createLocale(global); global.BioAILocale.init(); }
})(typeof window !== "undefined" ? window : globalThis);
