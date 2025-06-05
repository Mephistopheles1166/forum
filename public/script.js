class ForumApp {
  constructor() {
    this.isAdmin = false;
    this.currentReplyPostId = null;
    this.posts = [];
    this.userLikes = new Set();
    this.selectedImages = [];
    this.selectedReplyImages = [];
    this.currentImageSet = [];
    this.currentImageIndex = 0;
    this.isSearching = false;
    this.currentSearchTerm = '';
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadPosts();
    this.startAutoRefresh();
  }

  bindEvents() {
    // 字数统计
    this.bindCharCounter('department', 'deptCount', 20);
    this.bindCharCounter('content', 'contentCount', 500);
    this.bindCharCounter('replyDepartment', 'replyDeptCount', 20);
    this.bindCharCounter('replyContent', 'replyContentCount', 300);

    // 图片上传事件
    document.getElementById('imageInput').addEventListener('change', (e) => {
      this.handleImageSelection(e, 'main');
    });

    document.getElementById('replyImageInput').addEventListener('change', (e) => {
      this.handleImageSelection(e, 'reply');
    });

    // 搜索事件
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.performSearch();
      }
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        if (document.getElementById('replyModal').style.display === 'block') {
          this.submitReply();
        } else {
          this.submitPost();
        }
      }
      // ESC键关闭弹窗
      if (e.key === 'Escape') {
        this.closeReplyModal();
        this.closeImageViewer();
      }
    });

    // 点击模态框外部关闭
    document.getElementById('replyModal').addEventListener('click', (e) => {
      if (e.target.id === 'replyModal') {
        this.closeReplyModal();
      }
    });

    document.getElementById('imageViewer').addEventListener('click', (e) => {
      if (e.target.id === 'imageViewer') {
        this.closeImageViewer();
      }
    });
  }

  bindCharCounter(inputId, counterId, maxLength) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);

    input.addEventListener('input', () => {
      const length = input.value.length;
      counter.textContent = length;
      counter.style.color = length > maxLength * 0.8 ? '#ff6b6b' : '#666';

      if (length > maxLength) {
        input.style.borderColor = '#ff6b6b';
        counter.style.color = '#ff6b6b';
      } else {
        input.style.borderColor = '#e1e5e9';
      }
    });
  }

  // 处理图片选择
  handleImageSelection(event, type) {
    const files = Array.from(event.target.files);
    const maxFiles = type === 'main' ? 5 : 3;
    const currentImages = type === 'main' ? this.selectedImages : this.selectedReplyImages;

    if (currentImages.length + files.length > maxFiles) {
      this.showNotification(`最多只能选择${maxFiles}张图片`, 'warning');
      return;
    }

    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        if (file.size > 5 * 1024 * 1024) {
          this.showNotification(`图片 ${file.name} 过大，最大5MB`, 'warning');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const imageData = {
            file: file,
            url: e.target.result,
            name: file.name
          };

          if (type === 'main') {
            this.selectedImages.push(imageData);
            this.updateImagePreview('imagePreview', this.selectedImages);
          } else {
            this.selectedReplyImages.push(imageData);
            this.updateImagePreview('replyImagePreview', this.selectedReplyImages);
          }
        };
        reader.readAsDataURL(file);
      } else {
        this.showNotification(`${file.name} 不是有效的图片文件`, 'warning');
      }
    });

    // 清空input
    event.target.value = '';
  }

  // 更新图片预览
  updateImagePreview(containerId, images) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    images.forEach((image, index) => {
      const div = document.createElement('div');
      div.className = 'image-preview-item';
      div.innerHTML = `
                <img src="${image.url}" alt="${image.name}">
                <button class="remove-btn" onclick="app.removeImage(${index}, '${containerId}')">&times;</button>
            `;
      container.appendChild(div);
    });
  }

  // 移除图片
  removeImage(index, containerId) {
    if (containerId === 'imagePreview') {
      this.selectedImages.splice(index, 1);
      this.updateImagePreview('imagePreview', this.selectedImages);
    } else {
      this.selectedReplyImages.splice(index, 1);
      this.updateImagePreview('replyImagePreview', this.selectedReplyImages);
    }
  }

  // 生成部门标签颜色
  getDepartmentColor(department) {
    let hash = 0;
    for (let i = 0; i < department.length; i++) {
      hash = department.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 10;
  }

  // 格式化时间
  formatTime(timeString) {
    const now = new Date();
    const time = new Date(timeString);
    const diff = now - time;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;

    return time.toLocaleDateString('zh-CN');
  }

  // 获取完整时间
  getFullTime(timeString) {
    return new Date(timeString).toLocaleString('zh-CN');
  }

  // 显示通知
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

    const colors = {
      success: '#28a745',
      error: '#dc3545',
      info: '#17a2b8',
      warning: '#ffc107'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // 执行搜索
  performSearch() {
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) {
      this.clearSearch();
      return;
    }

    this.isSearching = true;
    this.currentSearchTerm = searchTerm;
    document.getElementById('clearBtn').style.display = 'block';
    this.loadPosts();
  }

  // 清除搜索
  clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearBtn').style.display = 'none';
    this.isSearching = false;
    this.currentSearchTerm = '';
    this.loadPosts();
  }

  // 加载所有发言
  async loadPosts() {
    try {
      let url = '/api/posts';
      if (this.isSearching && this.currentSearchTerm) {
        url += `?search=${encodeURIComponent(this.currentSearchTerm)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // 更新用户点赞状态
      this.userLikes.clear();
      data.forEach(item => {
        if (item.user_liked) {
          const type = item.type.startsWith('comment_') ? 'comment' : 'post';
          this.userLikes.add(`${type}_${item.id}`);
        }
      });

      this.posts = this.organizePosts(data);
      this.renderPosts();
    } catch (error) {
      console.error('加载发言失败:', error);
      document.getElementById('postsContainer').innerHTML =
        '<div class="error">❌ 加载失败，请检查网络连接或刷新页面重试</div>';
    }
  }

  // 组织发言和评论的层级结构
  organizePosts(data) {
    const posts = [];
    const comments = {};

    // 分离发言和评论
    data.forEach(item => {
      if (item.type === 'post') {
        posts.push({
          ...item,
          comments: []
        });
      } else {
        const postId = item.type.split('_')[1];
        if (!comments[postId]) comments[postId] = [];
        comments[postId].push(item);
      }
    });

    // 将评论按时间正序排列并关联到对应发言
    posts.forEach(post => {
      if (comments[post.id]) {
        post.comments = comments[post.id].sort((a, b) =>
          new Date(a.created_time) - new Date(b.created_time)
        );
      }
    });

    return posts;
  }

  // 渲染发言列表
  renderPosts() {
    const container = document.getElementById('postsContainer');

    if (this.posts.length === 0) {
      if (this.isSearching) {
        container.innerHTML = `
                    <div class="search-result-info">
                        <i class="fas fa-search"></i>
                        搜索 "${this.currentSearchTerm}" 没有找到相关内容
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <h3>没有找到匹配的内容</h3>
                        <p>尝试使用其他关键词搜索</p>
                    </div>
                `;
      } else {
        container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comments"></i>
                        <h3>还没有发言</h3>
                        <p>成为第一个发言的人吧！</p>
                    </div>
                `;
      }
      return;
    }

    let html = '';
    if (this.isSearching) {
      html += `
                <div class="search-result-info">
                    <i class="fas fa-search"></i>
                    搜索 "${this.currentSearchTerm}" 找到 ${this.posts.length} 条相关内容
                </div>
            `;
    }

    html += this.posts.map(post => this.renderPost(post)).join('');
    container.innerHTML = html;
  }

  // 渲染单个发言
  renderPost(post) {
    const colorClass = `dept-color-${this.getDepartmentColor(post.department)}`;
    const deleteBtn = this.isAdmin ?
      `<button class="delete-btn" onclick="app.deleteContent('post', ${post.id})">
                <i class="fas fa-trash"></i> 删除
            </button>` : '';

    const isLiked = this.userLikes.has(`post_${post.id}`);
    const likeClass = isLiked ? 'liked' : '';

    const commentsHtml = post.comments.map(comment => this.renderComment(comment)).join('');

    const adminBadge = post.is_admin ? '<span class="admin-badge"><i class="fas fa-crown"></i> 管理员</span>' : '';
    const adminClass = post.is_admin ? 'admin-post' : '';

    const imagesHtml = this.renderImages(post.images || [], 'post');

    return `
            <div class="post-item ${adminClass}" data-id="${post.id}">
                <div class="post-header">
                    <div class="header-left">
                        <span class="department-tag ${colorClass}">${this.escapeHtml(post.department)}</span>
                        ${adminBadge}
                    </div>
                    <span class="post-time" title="${this.getFullTime(post.created_time)}">
                        ${this.formatTime(post.created_time)}
                    </span>
                </div>
                <div class="post-content">
                    ${this.formatContent(post.content)}
                    ${imagesHtml}
                </div>
                <div class="post-actions">
                    <div class="action-buttons">
                        <button class="like-btn ${likeClass}" onclick="app.toggleLike('post', ${post.id}, this)">
                            <i class="fas fa-heart"></i>
                            <span>${post.likes_count}</span>
                        </button>
                        <button class="reply-btn" onclick="app.openReplyModal(${post.id})">
                            <i class="fas fa-reply"></i> 回复
                        </button>
                        ${deleteBtn}
                    </div>
                </div>
                ${commentsHtml}
            </div>
        `;
  }

  // 渲染评论
  renderComment(comment) {
    const colorClass = `dept-color-${this.getDepartmentColor(comment.department)}`;
    const deleteBtn = this.isAdmin ?
      `<button class="delete-btn" onclick="app.deleteContent('comment', ${comment.id})">
                <i class="fas fa-trash"></i> 删除
            </button>` : '';

    const isLiked = this.userLikes.has(`comment_${comment.id}`);
    const likeClass = isLiked ? 'liked' : '';

    const adminBadge = comment.is_admin ? '<span class="admin-badge"><i class="fas fa-crown"></i> 管理员</span>' : '';
    const adminClass = comment.is_admin ? 'admin-post' : '';

    const imagesHtml = this.renderImages(comment.images || [], 'comment');

    return `
            <div class="comment-item ${adminClass}" data-id="${comment.id}">
                <div class="post-header">
                    <div class="header-left">
                        <span class="department-tag ${colorClass}">${this.escapeHtml(comment.department)}</span>
                        ${adminBadge}
                    </div>
                    <span class="post-time" title="${this.getFullTime(comment.created_time)}">
                        ${this.formatTime(comment.created_time)}
                    </span>
                </div>
                <div class="post-content">
                    ${this.formatContent(comment.content)}
                    ${imagesHtml}
                </div>
                <div class="post-actions">
                    <div class="action-buttons">
                        <button class="like-btn ${likeClass}" onclick="app.toggleLike('comment', ${comment.id}, this)">
                            <i class="fas fa-heart"></i>
                            <span>${comment.likes_count}</span>
                        </button>
                        ${deleteBtn}
                    </div>
                </div>
            </div>
        `;
  }

  // 渲染图片
  renderImages(images, type) {
    if (!images || images.length === 0) return '';

    const imagesHtml = images.map((image, index) =>
      `<img src="/uploads/${image}" alt="图片" class="post-image" onclick="app.openImageViewer('${type}', ${index}, ['${images.join("','")}'])">`
    ).join('');

    return `<div class="post-images">${imagesHtml}</div>`;
  }

  // 打开图片查看器
  openImageViewer(type, index, images) {
    this.currentImageSet = images;
    this.currentImageIndex = index;
    this.updateImageViewer();
    document.getElementById('imageViewer').style.display = 'block';
  }

  // 更新图片查看器
  updateImageViewer() {
    const viewer = document.getElementById('viewerImage');
    const counter = document.getElementById('imageCounter');

    if (this.currentImageSet.length > 0) {
      viewer.src = `/uploads/${this.currentImageSet[this.currentImageIndex]}`;
      counter.textContent = `${this.currentImageIndex + 1} / ${this.currentImageSet.length}`;
    }
  }

  // 上一张图片
  prevImage() {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.updateImageViewer();
    }
  }

  // 下一张图片
  nextImage() {
    if (this.currentImageIndex < this.currentImageSet.length - 1) {
      this.currentImageIndex++;
      this.updateImageViewer();
    }
  }

  // 关闭图片查看器
  closeImageViewer() {
    document.getElementById('imageViewer').style.display = 'none';
    this.currentImageSet = [];
    this.currentImageIndex = 0;
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 格式化内容 - 修复空格和缩进问题
  formatContent(content) {
    if (!content) return '';

    // 转义HTML
    const escapedContent = this.escapeHtml(content);

    // 处理文本格式：
    // 1. 去除每行前后的空白字符
    // 2. 保留段落之间的换行
    // 3. 将连续的空格替换为单个空格
    const formattedContent = escapedContent
      .split('\n')                          // 按换行符分割
      .map(line => line.trim())             // 去除每行前后的空白
      .filter((line, index, arr) => {      // 过滤连续的空行，只保留一个
        if (line === '') {
          return index === 0 || arr[index - 1] !== '';
        }
        return true;
      })
      .join('\n')                           // 重新组合
      .replace(/\n\s*\n/g, '\n\n')         // 确保段落间只有一个空行
      .replace(/ +/g, ' ');                 // 将连续空格替换为单个空格

    return formattedContent;
  }

  // 清理输入文本 - 在提交前使用
  cleanInputText(text) {
    if (!text) return '';

    return text
      .split('\n')                          // 按换行符分割
      .map(line => line.trim())             // 去除每行前后的空白
      .filter((line, index, arr) => {      // 过滤连续的空行
        if (line === '') {
          return index === 0 || arr[index - 1] !== '';
        }
        return true;
      })
      .join('\n')                           // 重新组合
      .replace(/\n\s*\n\s*\n/g, '\n\n')    // 最多保留一个空行
      .replace(/ +/g, ' ')                  // 将连续空格替换为单个空格
      .trim();                              // 去除整体前后空白
  }

  // 发布发言
  async submitPost() {
    const department = document.getElementById('department').value.trim();
    const content = this.cleanInputText(document.getElementById('content').value);
    const submitBtn = document.getElementById('submitBtn');
    const isAdminPost = this.isAdmin && document.getElementById('adminPostCheck').checked;

    if (!department || !content) {
      this.showNotification('请填写部门和发言内容', 'warning');
      return;
    }

    if (department.length > 20) {
      this.showNotification('部门名称不能超过20字', 'warning');
      return;
    }

    if (content.length > 500) {
      this.showNotification('发言内容不能超过500字', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';

    try {
      const formData = new FormData();
      formData.append('department', department);
      formData.append('content', content);

      if (isAdminPost) {
        formData.append('adminPassword', document.getElementById('adminPassword').value);
      }

      // 添加图片
      this.selectedImages.forEach(image => {
        formData.append('images', image.file);
      });

      const response = await fetch('/api/posts', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        document.getElementById('department').value = '';
        document.getElementById('content').value = '';
        document.getElementById('deptCount').textContent = '0';
        document.getElementById('contentCount').textContent = '0';
        document.getElementById('adminPostCheck').checked = false;

        // 清空图片
        this.selectedImages = [];
        this.updateImagePreview('imagePreview', this.selectedImages);

        this.showNotification('发言发布成功！', 'success');
        this.loadPosts();
      } else {
        this.showNotification('发布失败: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('发布失败:', error);
      this.showNotification('发布失败，请检查网络连接', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '发布发言';
    }
  }

  // 打开回复弹窗
  openReplyModal(postId) {
    this.currentReplyPostId = postId;
    document.getElementById('replyModal').style.display = 'block';

    // 显示管理员选项
    if (this.isAdmin) {
      document.getElementById('adminReplyOption').style.display = 'block';
    }

    setTimeout(() => {
      document.getElementById('replyDepartment').focus();
    }, 100);
  }

  // 关闭回复弹窗
  closeReplyModal() {
    document.getElementById('replyModal').style.display = 'none';
    document.getElementById('replyDepartment').value = '';
    document.getElementById('replyContent').value = '';
    document.getElementById('replyDeptCount').textContent = '0';
    document.getElementById('replyContentCount').textContent = '0';
    document.getElementById('adminReplyCheck').checked = false;

    // 清空图片
    this.selectedReplyImages = [];
    this.updateImagePreview('replyImagePreview', this.selectedReplyImages);

    this.currentReplyPostId = null;
  }

  // 提交回复
  async submitReply() {
    const department = document.getElementById('replyDepartment').value.trim();
    const content = this.cleanInputText(document.getElementById('replyContent').value);
    const submitBtn = document.getElementById('replySubmitBtn');
    const isAdminReply = this.isAdmin && document.getElementById('adminReplyCheck').checked;

    if (!department || !content) {
      this.showNotification('请填写部门和回复内容', 'warning');
      return;
    }

    if (department.length > 20) {
      this.showNotification('部门名称不能超过20字', 'warning');
      return;
    }

    if (content.length > 300) {
      this.showNotification('回复内容不能超过300字', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';

    try {
      const formData = new FormData();
      formData.append('postId', this.currentReplyPostId);
      formData.append('department', department);
      formData.append('content', content);

      if (isAdminReply) {
        formData.append('adminPassword', document.getElementById('adminPassword').value);
      }

      // 添加图片
      this.selectedReplyImages.forEach(image => {
        formData.append('images', image.file);
      });

      const response = await fetch('/api/comments', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.closeReplyModal();
        this.showNotification('回复发布成功！', 'success');
        this.loadPosts();
      } else {
        this.showNotification('回复失败: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('回复失败:', error);
      this.showNotification('回复失败，请检查网络连接', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '发布回复';
    }
  }

  // 点赞/取消点赞
  async toggleLike(targetType, targetId, button) {
    try {
      if (button.disabled) return;
      button.disabled = true;

      const response = await fetch('/api/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetType, targetId })
      });

      const result = await response.json();

      if (result.action === 'liked') {
        button.classList.add('liked');
        this.userLikes.add(`${targetType}_${targetId}`);
      } else {
        button.classList.remove('liked');
        this.userLikes.delete(`${targetType}_${targetId}`);
      }

      const countSpan = button.querySelector('span');
      const currentCount = parseInt(countSpan.textContent);
      countSpan.textContent = result.action === 'liked' ? currentCount + 1 : currentCount - 1;

    } catch (error) {
      console.error('点赞操作失败:', error);
      this.showNotification('操作失败，请重试', 'error');
    } finally {
      setTimeout(() => {
        button.disabled = false;
      }, 1000);
    }
  }

  // 管理员登录
  async adminLogin() {
    const password = document.getElementById('adminPassword').value;

    if (!password) {
      this.showNotification('请输入管理员密码', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
      });

      const result = await response.json();

      if (result.success) {
        this.isAdmin = true;
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminStatus').style.display = 'block';
        document.getElementById('adminPostOption').style.display = 'block';
        this.showNotification('管理员登录成功', 'success');
        this.renderPosts();
      } else {
        this.showNotification('密码错误', 'error');
        document.getElementById('adminPassword').value = '';
      }
    } catch (error) {
      console.error('登录失败:', error);
      this.showNotification('登录失败，请重试', 'error');
    }
  }

  // 管理员退出
  adminLogout() {
    this.isAdmin = false;
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('adminStatus').style.display = 'none';
    document.getElementById('adminPostOption').style.display = 'none';
    document.getElementById('adminReplyOption').style.display = 'none';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPostCheck').checked = false;
    document.getElementById('adminReplyCheck').checked = false;
    this.showNotification('已退出管理员模式', 'info');
    this.renderPosts();
  }

  // 删除内容
  async deleteContent(type, id) {
    if (!confirm('确定要删除这条内容吗？此操作不可恢复！')) {
      return;
    }

    const password = prompt('请输入管理员密码确认删除操作:');
    if (!password) return;

    try {
      const response = await fetch('/api/admin/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, type, id })
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('删除成功', 'success');
        this.loadPosts();
      } else {
        this.showNotification('删除失败: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('删除失败:', error);
      this.showNotification('删除失败，请重试', 'error');
    }
  }

  // 自动刷新
  startAutoRefresh() {
    setInterval(() => {
      if (!this.isSearching) {
        this.loadPosts();
      }
    }, 30000);
  }
}

// 全局函数，供HTML调用
window.adminLogin = () => app.adminLogin();
window.adminLogout = () => app.adminLogout();
window.submitPost = () => app.submitPost();
window.submitReply = () => app.submitReply();
window.closeReplyModal = () => app.closeReplyModal();
window.performSearch = () => app.performSearch();
window.clearSearch = () => app.clearSearch();
window.closeImageViewer = () => app.closeImageViewer();
window.prevImage = () => app.prevImage();
window.nextImage = () => app.nextImage();

// 页面加载完成后创建应用实例
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ForumApp();
});
