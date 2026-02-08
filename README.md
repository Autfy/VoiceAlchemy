<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 运行与部署

这是一个基于 Gemini 的多说话人语音转换 Web 应用，支持最多 3 个参考说话人，提供「保持语气语速」与「自动重生成」两种模式。

AI Studio 项目入口： https://ai.studio/apps/drive/1KcZ5dmsrtw6B0xfjXWH_4ngFjSIm0CF1

## 本地运行

**前置条件：** Node.js

1. 安装依赖：
   `npm install`
2. 在 [.env.local](.env.local) 中配置 `VITE_GEMINI_API_KEY`：
   ```
   VITE_GEMINI_API_KEY=你的APIKey
   ```
3. 启动开发服务：
   `npm run dev`

## 使用说明

1. 上传源语音文件（WAV/MP3/M4A）。
2. 上传 1-3 个目标说话人参考音频。
3. 选择生成模式：
   - **保持语气语速（Mimic）**：会分析源音频韵律并尝试复刻语速/情绪。
   - **自动重生成（Clean）**：以自然清晰为目标，时长/语速可能不同于源音频。
4. 点击「开始转换」，生成结果会显示在右侧输出区域。

## 常见问题

### 1) 页面提示缺少 API Key
请确认 `.env.local` 中设置了 `VITE_GEMINI_API_KEY`，并重启开发服务。

### 2) 只能上传 3 个参考文件
当前 UI 仅支持最多 3 个参考说话人，用于多说话人语音合成。
