const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const JsonDatabase = require('./database');

const app = express();
const db = new JsonDatabase();
const PORT = 3099;
const ADMIN_PASSWORD = 'admin123';

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}_${random}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只能上传图片文件'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB限制
        files: 5 // 最多5个文件
    }
});

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${timestamp}] ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// 获取客户端IP地址
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.ip ||
           '127.0.0.1';
}

// 输入验证中间件
function validateInput(req, res, next) {
    const { department, content } = req.body;
    
    if (department && typeof department === 'string') {
        req.body.department = department.trim().substring(0, 20);
    }
    
    if (content && typeof content === 'string') {
        req.body.content = content.trim().substring(0, 500);
    }
    
    next();
}

// 检查管理员权限
function checkAdminAuth(password) {
    return password === ADMIN_PASSWORD;
}

// API路由

// 获取所有发言和评论
app.get('/api/posts', (req, res) => {
    try {
        const { search } = req.query;
        let posts;
        
        if (search && search.trim()) {
            posts = db.searchPosts(search.trim());
        } else {
            posts = db.getAllPosts();
        }
        
        const ipAddress = getClientIP(req);
        const userLikes = db.getUserLikes(ipAddress);
        
        // 标记用户已点赞的内容
        const likedItems = new Set();
        userLikes.forEach(like => {
            likedItems.add(`${like.target_type}_${like.target_id}`);
        });

        // 为每个帖子和评论添加用户点赞状态
        const postsWithLikeStatus = posts.map(post => ({
            ...post,
            user_liked: likedItems.has(`${post.type.startsWith('comment_') ? 'comment' : 'post'}_${post.id}`)
        }));

        res.json(postsWithLikeStatus);
    } catch (error) {
        console.error('获取发言失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发布新发言（支持图片上传）
app.post('/api/posts', upload.array('images', 5), validateInput, (req, res) => {
    try {
        const { content, department, adminPassword } = req.body;
        const ipAddress = getClientIP(req);
        const isAdmin = adminPassword && checkAdminAuth(adminPassword);

        if (!content || !department) {
            return res.status(400).json({ error: '内容和部门不能为空' });
        }

        if (content.length > 500) {
            return res.status(400).json({ error: '发言内容不能超过500字' });
        }

        if (department.length > 20) {
            return res.status(400).json({ error: '部门名称不能超过20字' });
        }

        // 处理上传的图片
        const images = req.files ? req.files.map(file => file.filename) : [];

        const postId = db.createPost(content, department, ipAddress, images, isAdmin);
        console.log(`新发言: [${department}] ${content.substring(0, 50)}... (ID: ${postId}, 图片: ${images.length}张, 管理员: ${isAdmin})`);
        
        res.json({ success: true, id: postId, images: images });
    } catch (error) {
        console.error('发布发言失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发布评论（支持图片上传）
app.post('/api/comments', upload.array('images', 3), validateInput, (req, res) => {
    try {
        const { postId, content, department, adminPassword } = req.body;
        const ipAddress = getClientIP(req);
        const isAdmin = adminPassword && checkAdminAuth(adminPassword);

        if (!postId || !content || !department) {
            return res.status(400).json({ error: '所有字段都不能为空' });
        }

        if (content.length > 300) {
            return res.status(400).json({ error: '评论内容不能超过300字' });
        }

        if (department.length > 20) {
            return res.status(400).json({ error: '部门名称不能超过20字' });
        }

        // 处理上传的图片
        const images = req.files ? req.files.map(file => file.filename) : [];

        const commentId = db.createComment(postId, content, department, ipAddress, images, isAdmin);
        console.log(`新评论: [${department}] 回复发言${postId}: ${content.substring(0, 30)}... (ID: ${commentId}, 图片: ${images.length}张, 管理员: ${isAdmin})`);
        
        res.json({ success: true, id: commentId, images: images });
    } catch (error) {
        console.error('发布评论失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 点赞操作
app.post('/api/like', (req, res) => {
    try {
        const { targetType, targetId } = req.body;
        const ipAddress = getClientIP(req);

        if (!targetType || !targetId) {
            return res.status(400).json({ error: '参数不完整' });
        }

        if (!['post', 'comment'].includes(targetType)) {
            return res.status(400).json({ error: '无效的目标类型' });
        }

        const result = db.toggleLike(targetType, targetId, ipAddress);
        res.json(result);
    } catch (error) {
        console.error('点赞操作失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 管理员验证
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const ipAddress = getClientIP(req);
    
    if (password === ADMIN_PASSWORD) {
        console.log(`管理员登录成功: ${ipAddress}`);
        res.json({ success: true, message: '管理员验证成功' });
    } else {
        console.log(`管理员登录失败: ${ipAddress} - 密码错误`);
        res.status(401).json({ success: false, message: '密码错误' });
    }
});

// 删除内容
app.delete('/api/admin/delete', (req, res) => {
    try {
        const { password, type, id } = req.body;
        const ipAddress = getClientIP(req);

        if (password !== ADMIN_PASSWORD) {
            console.log(`删除操作失败: ${ipAddress} - 管理员密码错误`);
            return res.status(401).json({ error: '管理员密码错误' });
        }

        if (!['post', 'comment'].includes(type)) {
            return res.status(400).json({ error: '无效的内容类型' });
        }

        const result = db.deleteContent(type, id);
        console.log(`管理员删除${type}: ${id} (IP: ${ipAddress})`);
        
        res.json({ success: true, deleted: result });
    } catch (error) {
        console.error('删除内容失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取统计信息
app.get('/api/admin/stats', (req, res) => {
    try {
        const stats = db.getStats();
        res.json(stats);
    } catch (error) {
        console.error('获取统计失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 根路径重定向到主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: '页面不存在' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '图片文件过大，最大5MB' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: '图片数量过多，最多5张' });
        }
    }
    if (err.message === '只能上传图片文件') {
        return res.status(400).json({ error: '只能上传图片文件' });
    }
    
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n正在关闭服务器...');
    db.close();
    process.exit(0);
});

// 每天清理一次过期数据
setInterval(() => {
    console.log('执行数据清理...');
    db.cleanup();
}, 24 * 60 * 60 * 1000);

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    const stats = db.getStats();
    console.log(`==================================================`);
    console.log(`🚀 局域网论坛服务器启动成功！`);
    console.log(`📍 本地访问地址: http://localhost:${PORT}`);
    console.log(`🌐 局域网访问地址: http://[您的IP地址]:${PORT}`);
    console.log(`🔑 管理员密码: ${ADMIN_PASSWORD}`);
    console.log(`📊 当前数据: ${stats.posts}条发言, ${stats.comments}条评论, ${stats.likes}个点赞, ${stats.images}张图片`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`📁 数据文件: forum-data.json`);
    console.log(`🖼️  图片目录: public/uploads`);
    console.log(`==================================================`);
});