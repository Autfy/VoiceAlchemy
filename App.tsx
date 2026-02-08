import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { fileToBase64, decode, decodeAudioData } from './utils/audioUtils';

// --- Icons ---
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);
const MagicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 5h4"/><path d="M3 9h4"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const ZapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

interface SpeakerProfile {
  id: number;
  voiceName: string;
  styleDescription: string;
}

type GenerationMode = 'mimic' | 'clean';

const App: React.FC = () => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  // Support up to 3 reference files
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<GenerationMode>('clean');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  
  // Analysis results
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([]);
  const [transcription, setTranscription] = useState<string>('');
  const [prosodyNote, setProsodyNote] = useState<string>('');

  const outputAudioContextRef = useRef<AudioContext | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceFile(file);
      setGeneratedAudioUrl(null); 
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (!sourceFile) {
      if (sourcePreviewUrl) {
        URL.revokeObjectURL(sourcePreviewUrl);
        setSourcePreviewUrl(null);
      }
      return;
    }
    const previewUrl = URL.createObjectURL(sourceFile);
    setSourcePreviewUrl(previewUrl);
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [sourceFile]);

  useEffect(() => {
    if (!generatedAudioUrl) return;
    return () => {
      URL.revokeObjectURL(generatedAudioUrl);
    };
  }, [generatedAudioUrl]);

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (refFiles.length >= 3) {
        addLog("警告: 最多只允许3个参考文件。");
        e.target.value = '';
        return;
      }
      setRefFiles(prev => [...prev, file]);
    }
    e.target.value = '';
  };

  const removeRefFile = (index: number) => {
    setRefFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processConversion = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      const missingKeyMessage = "缺少 VITE_GEMINI_API_KEY，请在 .env.local 中配置。";
      addLog(`错误: ${missingKeyMessage}`);
      setErrorMessage(missingKeyMessage);
      return;
    }
    if (!sourceFile || refFiles.length === 0) {
      addLog("错误: 请上传源文件和至少一个目标参考音频。");
      setErrorMessage("请上传源文件和至少一个目标参考音频。");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    setGeneratedAudioUrl(null);
    setSpeakerProfiles([]);
    setTranscription('');
    setProsodyNote('');
    setErrorMessage(null);
    addLog("正在初始化转换流程...");

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // --- Step 1: Analyze Reference Audios (Multi-speaker) ---
      addLog(`步骤 1: 正在分析 ${refFiles.length} 个目标声音特征...`);
      
      const profiles: SpeakerProfile[] = [];

      // Process each reference file sequentially to build profiles
      for (let i = 0; i < refFiles.length; i++) {
        const file = refFiles[i];
        if (!file) continue;
        const speakerId = i + 1;
        addLog(`正在分析说话人 ${speakerId} (参考文件: ${file.name})...`);
        
        const refBase64 = await fileToBase64(file);
        
        const analysisResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: {
            parts: [
              { inlineData: { mimeType: file.type || 'audio/wav', data: refBase64 } },
              { text: `Analyze this speaker's voice. 
                       1. Provide a concise style description (gender, age, tone, speed, emotion). 
                       2. Select the closest matching voice personality from this list: [Puck, Charon, Kore, Fenrir, Zephyr].
                       ` }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                styleDescription: { type: Type.STRING, description: "A concise description of the voice style." },
                closestVoice: { type: Type.STRING, description: "The closest match from the list [Puck, Charon, Kore, Fenrir, Zephyr]" }
              },
              required: ["styleDescription", "closestVoice"]
            }
          }
        });

        let analysisJson: any = { styleDescription: "通用样式", closestVoice: "Fenrir" };
        try {
          if (analysisResponse.text) {
            analysisJson = JSON.parse(analysisResponse.text);
          }
        } catch (e) {
          addLog(`警告: 无法解析说话人 ${speakerId} 的分析结果，使用默认值。`);
        }

        profiles.push({
          id: speakerId,
          voiceName: analysisJson.closestVoice,
          styleDescription: analysisJson.styleDescription
        });
        
        addLog(`说话人 ${speakerId} -> 匹配音色: ${analysisJson.closestVoice} | 风格: "${analysisJson.styleDescription}"`);
      }
      setSpeakerProfiles(profiles);

      const sourceBase64 = await fileToBase64(sourceFile);

      // --- Step 2: Analyze Source Prosody (Only if Mode == 'mimic') ---
      let prosodyInstruction = "";
      if (mode === 'mimic') {
        addLog("步骤 2 (Mimic模式): 正在分析源音频的韵律和节奏...");
        const prosodyResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: {
             parts: [
                { inlineData: { mimeType: sourceFile.type || 'audio/wav', data: sourceBase64 } },
                { text: "Describe the pacing, speed, pauses, and emotional intensity of this audio in one clear sentence. Do not mention the content, only the delivery style."}
             ]
          }
        });
        const pText = prosodyResponse.text?.trim() || "Normal pacing.";
        setProsodyNote(pText);
        prosodyInstruction = `Perform with this specific delivery style: ${pText}. `;
        addLog(`韵律特征提取完毕: "${pText}"`);
      }

      // --- Step 3: Transcribe Source Audio ---
      addLog("步骤 3: 正在转录源音频内容并识别说话人...");
      
      let transcriptPrompt = "Transcribe exactly what is spoken in this audio. ";
      if (refFiles.length > 1) {
        transcriptPrompt += `Identify distinct speakers. Label them strictly as "Speaker 1", "Speaker 2", etc., up to "Speaker ${refFiles.length}". Format the output as a script, e.g., \nSpeaker 1: Hello there.\nSpeaker 2: Hi, how are you?`;
      } else {
        transcriptPrompt += `Format the output as: Speaker 1: [text]`;
      }

      const transResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: sourceFile.type || 'audio/wav', data: sourceBase64 } },
            { text: transcriptPrompt }
          ]
        }
      });

      const transcribedText = transResponse.text?.trim() || "";
      if (!transcribedText) throw new Error("无法转录源音频。");
      
      setTranscription(transcribedText);
      addLog(`转录完成 (${transcribedText.length} 字符).`);

      // --- Step 4: Synthesis (Multi-speaker TTS) ---
      addLog(`步骤 4: 正在合成语音 (${mode === 'mimic' ? '保持语气' : '自动生成'})...`);

      const speakerVoiceConfigs = profiles.map(p => ({
        speaker: `Speaker ${p.id}`,
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: (p.voiceName || 'Fenrir') as any
          }
        }
      }));

      // Construct final prompt based on mode
      let ttsPrompt = "";
      if (mode === 'mimic') {
         ttsPrompt = `Re-enact the following conversation using the assigned voices. \n\nIMPORTANT INSTRUCTION: ${prosodyInstruction}\n\nTranscript:\n${transcribedText}`;
      } else {
         ttsPrompt = `Synthesize the following conversation clearly and naturally.\n\nTranscript:\n${transcribedText}`;
      }
      
      const synthesisResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: {
          parts: [
            { text: ttsPrompt }
          ]
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: speakerVoiceConfigs
            }
          }
        }
      });

      // Extract Audio
      const audioPart = synthesisResponse.candidates?.[0]?.content?.parts?.[0];
      if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
         addLog("正在解码音频流...");
         const rawBase64 = audioPart.inlineData.data;
         
         if (!outputAudioContextRef.current) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            outputAudioContextRef.current = new AudioContext({sampleRate: 24000});
         }
         const ctx = outputAudioContextRef.current;
         const audioBuffer = await decodeAudioData(decode(rawBase64), ctx, 24000, 1);
         
         const wavBlob = audioBufferToWav(audioBuffer);
         const url = URL.createObjectURL(wavBlob);
         setGeneratedAudioUrl(url);
         addLog("成功! 转换已完成。");
      } else {
         addLog("错误: 未收到TTS模型生成的音频数据。");
         setErrorMessage("未收到TTS模型生成的音频数据。");
      }

    } catch (e: any) {
      console.error(e);
      addLog(`错误: ${e.message || "发生未知错误"}`);
      setErrorMessage(e.message || "发生未知错误");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
           <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <MagicIcon />
           </div>
           <div>
              <h1 className="text-2xl font-bold text-slate-100">OpenVoice <span className="text-slate-500 font-light">Gemini WebUI</span></h1>
              <p className="text-slate-400 text-sm">多说话人语音转换（支持最多3人）</p>
           </div>
        </div>

        {/* Gradio Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column: Inputs */}
          <div className="space-y-6">
             
             {/* Source Audio Input */}
             <div className="gradio-container">
                <div className="gradio-header">1. 源语音内容</div>
                <div className="gradio-content space-y-4">
                   <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:border-orange-500/50 transition-colors bg-slate-800/20">
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={handleSourceUpload}
                        className="hidden" 
                        id="source-upload"
                      />
                      <label htmlFor="source-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <UploadIcon />
                        <span className="text-sm font-medium text-slate-300">
                           {sourceFile ? sourceFile.name : "点击上传源文件"}
                        </span>
                        <span className="text-xs text-slate-500">支持 WAV, MP3, M4A</span>
                      </label>
                   </div>
                   {sourcePreviewUrl && (
                      <audio controls className="w-full h-10 mt-2 block" src={sourcePreviewUrl} />
                   )}
                </div>
             </div>

             {/* Reference Audio Input (Multi-Speaker) */}
             <div className="gradio-container">
                <div className="gradio-header flex justify-between items-center">
                  <span>2. 目标说话人 (最多3个)</span>
                  <span className="text-xs font-normal text-slate-400">{refFiles.length} / 3</span>
                </div>
                <div className="gradio-content space-y-4">
                   
                   {/* File List */}
                   <div className="space-y-2">
                      {refFiles.map((file, idx) => (
                        file && (
                          <div key={idx} className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
                             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-orange-500">
                                <UserIcon />
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-200 truncate">Speaker {idx + 1}</div>
                                <div className="text-xs text-slate-500 truncate">{file.name}</div>
                             </div>
                             <button 
                                onClick={() => removeRefFile(idx)}
                                className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                             >
                                <TrashIcon />
                             </button>
                          </div>
                        )
                      ))}
                      
                      {refFiles.length === 0 && (
                        <div className="text-center py-4 text-slate-600 italic text-sm">
                          暂无参考说话人。
                        </div>
                      )}
                   </div>

                   {/* Add Button */}
                   {refFiles.length < 3 && (
                     <div className="relative">
                        <input 
                          type="file" 
                          accept="audio/*" 
                          onChange={handleRefUpload}
                          className="hidden" 
                          id="ref-upload"
                        />
                        <label 
                          htmlFor="ref-upload" 
                          className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 cursor-pointer transition-all"
                        >
                          <PlusIcon />
                          <span className="text-sm">添加说话人参考文件</span>
                        </label>
                     </div>
                   )}
                   
                   {refFiles.length > 0 && (
                     <div className="text-xs text-slate-500">
                        * 模型会将源音频中的 "Speaker 1" 映射到第一个上传文件的音色，以此类推。
                     </div>
                   )}
                </div>
             </div>

             {/* Generation Mode Selection */}
             <div className="gradio-container">
                <div className="gradio-header">3. 生成模式</div>
                <div className="gradio-content space-y-3">
                   
                   <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${mode === 'mimic' ? 'bg-orange-900/20 border-orange-500/50' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                      <input 
                        type="radio" 
                        name="gen-mode" 
                        className="mt-1"
                        checked={mode === 'mimic'} 
                        onChange={() => setMode('mimic')} 
                      />
                      <div>
                         <div className="flex items-center gap-2 font-medium text-slate-200 text-sm">
                            <ClockIcon /> 保持语气语速 (Mimic)
                         </div>
                         <div className="text-xs text-slate-400 mt-1">
                            分析源音频的韵律（速度、停顿、情感），并让模型模仿这种表达方式。
                         </div>
                      </div>
                   </label>

                   <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${mode === 'clean' ? 'bg-orange-900/20 border-orange-500/50' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                      <input 
                        type="radio" 
                        name="gen-mode" 
                        className="mt-1"
                        checked={mode === 'clean'} 
                        onChange={() => setMode('clean')} 
                      />
                      <div>
                         <div className="flex items-center gap-2 font-medium text-slate-200 text-sm">
                            <ZapIcon /> 自动重生成 (Clean)
                         </div>
                         <div className="text-xs text-slate-400 mt-1">
                            生成高质量、清晰的语音，语速自然流畅。可能会改变原语音的时长和语速。
                         </div>
                      </div>
                   </label>

                </div>
             </div>

             <button
               onClick={processConversion}
               disabled={isProcessing || !sourceFile || refFiles.length === 0}
               className={`w-full py-4 rounded-lg font-bold text-lg uppercase tracking-wide transition-all shadow-lg
                  ${isProcessing || !sourceFile || refFiles.length === 0
                     ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                     : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20 hover:shadow-orange-500/20'
                  }`}
             >
               {isProcessing ? '正在处理中...' : '开始转换'}
             </button>

          </div>

          {/* Right Column: Outputs */}
          <div className="space-y-6">

             {errorMessage && (
               <div className="gradio-container border border-red-500/40 bg-red-950/30">
                  <div className="gradio-header text-red-200">发生错误</div>
                  <div className="gradio-content text-sm text-red-100">
                    {errorMessage}
                  </div>
               </div>
             )}
             
             {/* Output Result */}
             <div className="gradio-container min-h-[200px] flex flex-col">
                <div className="gradio-header">输出结果</div>
                <div className="gradio-content flex-1 flex flex-col items-center justify-center gap-4 bg-slate-900/50">
                   {generatedAudioUrl ? (
                      <div className="w-full space-y-4 animate-in fade-in duration-500">
                         <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                            <p className="text-green-400 font-medium text-sm">转换成功</p>
                         </div>
                         <audio controls className="w-full" src={generatedAudioUrl} autoPlay />
                         <a 
                           href={generatedAudioUrl} 
                           download="voice_conversion.wav"
                           className="block w-full py-2 text-center text-sm text-slate-400 hover:text-white border border-slate-700 rounded hover:bg-slate-800 transition-colors"
                         >
                           下载 .WAV
                         </a>
                      </div>
                   ) : (
                      <div className="text-slate-600 text-center">
                         <div className="w-16 h-16 mx-auto mb-3 border-4 border-slate-800 rounded-full flex items-center justify-center">
                            {isProcessing ? (
                               <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                               <PlayIcon />
                            )}
                         </div>
                         <p className="text-sm">生成的音频将显示在这里</p>
                      </div>
                   )}
                </div>
             </div>

             {/* Pipeline Info */}
             {(speakerProfiles.length > 0 || transcription) && (
               <div className="gradio-container">
                  <div className="gradio-header">处理流程信息</div>
                  <div className="gradio-content space-y-4">
                     
                     {speakerProfiles.length > 0 && (
                       <div>
                         <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">分析后的配置 (Profiles)</div>
                         <div className="space-y-2">
                           {speakerProfiles.map((p) => (
                             <div key={p.id} className="bg-slate-950 p-2 rounded text-xs border border-slate-800">
                               <span className="text-orange-400 font-bold">Speaker {p.id}:</span> <span className="text-slate-300">{p.voiceName}</span>
                               <p className="text-slate-500 italic mt-1 line-clamp-2">"{p.styleDescription}"</p>
                             </div>
                           ))}
                         </div>
                       </div>
                     )}

                     {prosodyNote && (
                        <div>
                           <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">源语音韵律分析</div>
                           <div className="bg-orange-950/30 p-2 rounded text-sm text-orange-200 border border-orange-900/50 italic font-serif">
                              "{prosodyNote}"
                           </div>
                        </div>
                     )}

                     {transcription && (
                        <div>
                           <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">转录文本预览</div>
                           <div className="bg-slate-950 p-2 rounded text-sm text-slate-300 border border-slate-800 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                              {transcription}
                           </div>
                        </div>
                     )}
                  </div>
               </div>
             )}

             {/* Logs */}
             <div className="gradio-container flex-1">
                <div className="gradio-header">控制台日志</div>
                <div className="gradio-content">
                   <div className="bg-black/40 rounded h-40 overflow-y-auto p-3 font-mono text-xs space-y-1 text-slate-400 border border-slate-800/50">
                      {logs.length === 0 && <span className="opacity-50">等待输入...</span>}
                      {logs.map((log, i) => (
                         <div key={i} className="border-l-2 border-slate-700 pl-2">{log}</div>
                      ))}
                   </div>
                </div>
             </div>

          </div>
        </div>

      </div>
    </div>
  );
};

// Simple WAV Header encoder helper for browser playback
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for(i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++
  }

  return new Blob([bufferArr], { type: "audio/wav" });

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

export default App;
