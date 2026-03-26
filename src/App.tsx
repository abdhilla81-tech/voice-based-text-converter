/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic, 
  Square, 
  Play, 
  Copy, 
  Check, 
  RefreshCw, 
  Wand2, 
  Mail, 
  MessageSquare, 
  FileText, 
  Volume2,
  Loader2,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect } from "react";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type ConversionStyle = "original" | "professional" | "casual" | "summary" | "bullet-points";

interface ConversionOption {
  id: ConversionStyle;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const CONVERSION_OPTIONS: ConversionOption[] = [
  { 
    id: "original", 
    label: "Original", 
    icon: <FileText className="w-4 h-4" />, 
    prompt: "Return the original transcription exactly as it is." 
  },
  { 
    id: "professional", 
    label: "Professional Email", 
    icon: <Mail className="w-4 h-4" />, 
    prompt: "Rewrite this voice message as a professional, polite, and clear email. Keep the core message but use formal language and structure." 
  },
  { 
    id: "casual", 
    label: "Friendly Text", 
    icon: <MessageSquare className="w-4 h-4" />, 
    prompt: "Rewrite this voice message as a friendly, casual text message. Use natural conversational language and emojis where appropriate." 
  },
  { 
    id: "summary", 
    label: "Concise Summary", 
    icon: <Wand2 className="w-4 h-4" />, 
    prompt: "Summarize the key points of this voice message in 1-2 concise sentences." 
  },
  { 
    id: "bullet-points", 
    label: "Action Items", 
    icon: <Check className="w-4 h-4" />, 
    prompt: "Extract the main action items or key takeaways from this message into a bulleted list." 
  },
];

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState("");
  const [convertedText, setConvertedText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<ConversionStyle>("original");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        processAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      setError(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    setError(null);
    try {
      const base64Audio = await blobToBase64(blob);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: "audio/webm",
              data: base64Audio,
            },
          },
          { text: "Transcribe this audio exactly. If there is no speech, return an empty string. Do not add any commentary." },
        ],
      });

      const text = response.text || "";
      setTranscription(text);
      setConvertedText(text);
      setSelectedStyle("original");
    } catch (err) {
      console.error("Error transcribing audio:", err);
      setError("Failed to transcribe audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const convertMessage = async (style: ConversionStyle) => {
    if (!transcription) return;
    
    setIsProcessing(true);
    setSelectedStyle(style);
    setError(null);

    try {
      const option = CONVERSION_OPTIONS.find(o => o.id === style);
      if (!option) return;

      if (style === "original") {
        setConvertedText(transcription);
        setIsProcessing(false);
        return;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: `Original transcription: "${transcription}"\n\nTask: ${option.prompt}` },
        ],
      });

      setConvertedText(response.text || transcription);
    } catch (err) {
      console.error("Error converting message:", err);
      setError("Failed to convert message. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const speakText = async () => {
    if (!convertedText || isSpeaking) return;

    setIsSpeaking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: convertedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Convert 16-bit PCM to Float32
        const pcmData = new Int16Array(bytes.buffer);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768.0;
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        
        const audioBuffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
        audioBuffer.getChannelData(0).set(floatData);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("Error playing audio:", err);
      setIsSpeaking(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(convertedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const reset = () => {
    setAudioBlob(null);
    setTranscription("");
    setConvertedText("");
    setSelectedStyle("original");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-3 bg-blue-600 text-white rounded-2xl mb-4 shadow-lg"
          >
            <Mic className="w-8 h-8" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-4xl md:text-5xl font-display font-bold text-slate-900 mb-2"
          >
            Voice Converter
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 text-lg"
          >
            Speak naturally, we'll handle the rest.
          </motion.p>
        </div>

        {/* Main Interface */}
        <div className="glass-card rounded-3xl overflow-hidden p-6 md:p-10">
          <AnimatePresence mode="wait">
            {!audioBlob && !isRecording ? (
              <motion.div 
                key="start"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="flex flex-col items-center py-12"
              >
                <button
                  onClick={startRecording}
                  className="group relative w-32 h-32 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all duration-300 shadow-xl hover:shadow-blue-200 active:scale-95"
                  id="record-button"
                >
                  <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 group-hover:animate-ping"></div>
                  <Mic className="w-12 h-12 relative z-10" />
                </button>
                <p className="mt-8 text-slate-400 font-medium">Tap to start recording</p>
              </motion.div>
            ) : isRecording ? (
              <motion.div 
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12"
              >
                <div className="text-5xl font-mono font-bold text-slate-900 mb-8 tabular-nums">
                  {formatTime(recordingTime)}
                </div>
                <div className="flex items-center space-x-4 mb-8">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        height: [20, 40, 20],
                        opacity: [0.5, 1, 0.5]
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 0.8, 
                        delay: i * 0.1 
                      }}
                      className="w-2 bg-blue-600 rounded-full"
                    />
                  ))}
                </div>
                <button
                  onClick={stopRecording}
                  className="w-20 h-20 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-all shadow-lg active:scale-95"
                  id="stop-button"
                >
                  <Square className="w-8 h-8 fill-current" />
                </button>
                <p className="mt-6 text-red-500 font-semibold record-pulse">Recording...</p>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Style Selector */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {CONVERSION_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => convertMessage(option.id)}
                      disabled={isProcessing}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedStyle === option.id 
                          ? "bg-blue-600 text-white shadow-md" 
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      } disabled:opacity-50`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>

                {/* Result Area */}
                <div className="relative min-h-[200px] bg-slate-50 rounded-2xl p-6 border border-slate-200">
                  {isProcessing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm rounded-2xl z-10">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                      <p className="text-slate-500 text-sm font-medium">Gemini is thinking...</p>
                    </div>
                  ) : transcription === "" ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 italic">
                      No speech detected. Try again.
                    </div>
                  ) : (
                    <div className="prose prose-slate max-w-none">
                      <p className="text-slate-800 text-lg leading-relaxed whitespace-pre-wrap">
                        {convertedText}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex space-x-2">
                    <button
                      onClick={speakText}
                      disabled={!convertedText || isSpeaking || isProcessing}
                      className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm"
                      title="Listen to message"
                    >
                      {isSpeaking ? (
                        <div className="flex space-x-1">
                          <div className="w-1 h-4 bg-blue-600 animate-bounce" />
                          <div className="w-1 h-4 bg-blue-600 animate-bounce delay-75" />
                          <div className="w-1 h-4 bg-blue-600 animate-bounce delay-150" />
                        </div>
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={copyToClipboard}
                      disabled={!convertedText || isProcessing}
                      className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm flex items-center space-x-2"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                      {copied && <span className="text-xs font-bold text-green-500">Copied!</span>}
                    </button>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={reset}
                      className="p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
                      title="Discard and start over"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={startRecording}
                      className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg active:scale-95 font-bold"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Record New</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium flex items-center space-x-2"
            >
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span>{error}</span>
            </motion.div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          Powered by Gemini 3.1 Pro & Flash
        </div>
      </div>
    </div>
  );
}
