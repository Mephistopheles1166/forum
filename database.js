const fs = require('fs');
const path = require('path');

class JsonDatabase {
    constructor() {
        this.dataFile = path.join(__dirname, 'forum-data.json');
        this.uploadsDir = path.join(__dirname, 'public', 'uploads');
        this.data = this.loadData();
        this.ensureUploadsDir();
        this.autoSaveInterval = setInterval(() => {
            this.saveData();
        }, 5000);
    }

    // 确保上传目录存在
    ensureUploadsDir() {
        if (!fs.existsSync(this.uploadsDir)) {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    // 加载数据
    loadData() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                return {
                    posts: data.posts || [],
                    comments: data.comments || [],
                    likes: data.likes || [],
                    counters: data.counters || { posts: 0, comments: 0, likes: 0 }
                };
            }
        } catch (error) {
            console.error('加载数据文件失败:', error);
        }
        
        return {
            posts: [],
            comments: [],
            likes: [],
            counters: { posts: 0, comments: 0, likes: 0 }
        };
    }

    // 保存数据
    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (error) {
            console.error('保存数据文件失败:', error);
        }
    }

    // 生成新ID
    generateId(type) {
        this.data.counters[type]++;
        return this.data.counters[type];
    }

    // 获取所有发言和评论
    getAllPosts() {
        const posts = this.data.posts
            .filter(post => !post.is_deleted)
            .map(post => ({
                ...post,
                type: 'post'
            }));

        const comments = this.data.comments
            .filter(comment => !comment.is_deleted)
            .map(comment => ({
                ...comment,
                type: `comment_${comment.post_id}`
            }));

        return [...posts, ...comments].sort((a, b) => 
            new Date(b.created_time) - new Date(a.created_time)
        );
    }

    // 搜索功能
    searchPosts(keyword) {
        const lowerKeyword = keyword.toLowerCase();
        
        const posts = this.data.posts
            .filter(post => !post.is_deleted)
            .filter(post => 
                post.content.toLowerCase().includes(lowerKeyword) ||
                post.department.toLowerCase().includes(lowerKeyword)
            )
            .map(post => ({
                ...post,
                type: 'post'
            }));

        const comments = this.data.comments
            .filter(comment => !comment.is_deleted)
            .filter(comment => 
                comment.content.toLowerCase().includes(lowerKeyword) ||
                comment.department.toLowerCase().includes(lowerKeyword)
            )
            .map(comment => ({
                ...comment,
                type: `comment_${comment.post_id}`
            }));

        return [...posts, ...comments].sort((a, b) => 
            new Date(b.created_time) - new Date(a.created_time)
        );
    }

    // 发布新发言
    createPost(content, department, ipAddress, images = [], isAdmin = false) {
        const post = {
            id: this.generateId('posts'),
            content,
            department,
            ip_address: ipAddress,
            created_time: new Date().toISOString(),
            likes_count: 0,
            is_deleted: false,
            images: images || [],
            is_admin: isAdmin
        };

        this.data.posts.push(post);
        this.saveData();
        return post.id;
    }

    // 发布评论
    createComment(postId, content, department, ipAddress, images = [], isAdmin = false) {
        const comment = {
            id: this.generateId('comments'),
            post_id: parseInt(postId),
            content,
            department,
            ip_address: ipAddress,
            created_time: new Date().toISOString(),
            likes_count: 0,
            is_deleted: false,
            images: images || [],
            is_admin: isAdmin
        };

        this.data.comments.push(comment);
        this.saveData();
        return comment.id;
    }

    // 检查是否已点赞
    checkLike(targetType, targetId, ipAddress) {
        return this.data.likes.find(like => 
            like.target_type === targetType && 
            like.target_id === parseInt(targetId) && 
            like.ip_address === ipAddress
        );
    }

    // 点赞切换
    toggleLike(targetType, targetId, ipAddress) {
        const targetIdInt = parseInt(targetId);
        const existingLike = this.checkLike(targetType, targetIdInt, ipAddress);

        if (existingLike) {
            // 取消点赞
            this.data.likes = this.data.likes.filter(like => 
                !(like.target_type === targetType && 
                  like.target_id === targetIdInt && 
                  like.ip_address === ipAddress)
            );
            this.updateLikeCount(targetType, targetIdInt, -1);
            this.saveData();
            return { action: 'unliked' };
        } else {
            // 添加点赞
            const like = {
                id: this.generateId('likes'),
                target_type: targetType,
                target_id: targetIdInt,
                ip_address: ipAddress,
                created_time: new Date().toISOString()
            };
            this.data.likes.push(like);
            this.updateLikeCount(targetType, targetIdInt, 1);
            this.saveData();
            return { action: 'liked' };
        }
    }

    // 更新点赞数
    updateLikeCount(targetType, targetId, increment) {
        if (targetType === 'post') {
            const post = this.data.posts.find(p => p.id === targetId);
            if (post) {
                post.likes_count = Math.max(0, post.likes_count + increment);
            }
        } else if (targetType === 'comment') {
            const comment = this.data.comments.find(c => c.id === targetId);
            if (comment) {
                comment.likes_count = Math.max(0, comment.likes_count + increment);
            }
        }
    }

    // 删除内容（软删除）
    deleteContent(type, id) {
        const idInt = parseInt(id);
        let deleted = 0;

        if (type === 'post') {
            const post = this.data.posts.find(p => p.id === idInt);
            if (post && !post.is_deleted) {
                post.is_deleted = true;
                deleted = 1;
                
                // 同时删除该发言下的所有评论
                this.data.comments.forEach(comment => {
                    if (comment.post_id === idInt && !comment.is_deleted) {
                        comment.is_deleted = true;
                    }
                });
            }
        } else if (type === 'comment') {
            const comment = this.data.comments.find(c => c.id === idInt);
            if (comment && !comment.is_deleted) {
                comment.is_deleted = true;
                deleted = 1;
            }
        }

        if (deleted > 0) {
            this.saveData();
        }
        return deleted;
    }

    // 获取用户点赞状态
    getUserLikes(ipAddress) {
        return this.data.likes
            .filter(like => like.ip_address === ipAddress)
            .map(like => ({
                target_type: like.target_type,
                target_id: like.target_id
            }));
    }

    // 数据统计
    getStats() {
        const activePosts = this.data.posts.filter(p => !p.is_deleted).length;
        const activeComments = this.data.comments.filter(c => !c.is_deleted).length;
        const totalLikes = this.data.likes.length;
        const totalImages = this.data.posts.reduce((sum, p) => sum + (p.images?.length || 0), 0) +
                           this.data.comments.reduce((sum, c) => sum + (c.images?.length || 0), 0);

        return {
            posts: activePosts,
            comments: activeComments,
            likes: totalLikes,
            images: totalImages,
            total: activePosts + activeComments
        };
    }

    // 清理过期数据和孤立图片
    cleanup() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 收集仍在使用的图片
        const usedImages = new Set();
        this.data.posts.forEach(post => {
            if (!post.is_deleted && post.images) {
                post.images.forEach(img => usedImages.add(img));
            }
        });
        this.data.comments.forEach(comment => {
            if (!comment.is_deleted && comment.images) {
                comment.images.forEach(img => usedImages.add(img));
            }
        });

        // 清理过期的已删除内容
        this.data.posts = this.data.posts.filter(post => {
            if (post.is_deleted && new Date(post.created_time) < thirtyDaysAgo) {
                return false;
            }
            return true;
        });

        this.data.comments = this.data.comments.filter(comment => {
            if (comment.is_deleted && new Date(comment.created_time) < thirtyDaysAgo) {
                return false;
            }
            return true;
        });

        // 清理孤立的图片文件
        try {
            const uploadFiles = fs.readdirSync(this.uploadsDir);
            uploadFiles.forEach(file => {
                if (!usedImages.has(file)) {
                    const filePath = path.join(this.uploadsDir, file);
                    fs.unlinkSync(filePath);
                    console.log(`清理孤立图片: ${file}`);
                }
            });
        } catch (error) {
            console.error('清理图片失败:', error);
        }

        this.saveData();
    }

    // 关闭数据库
    close() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        this.saveData();
    }
}

module.exports = JsonDatabase;