

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Chat } from '@google/genai';
import { GoogleGenAI, LiveSession, Modality, Blob, LiveServerMessage } from '@google/genai';
import { createChatSession } from '../services/geminiService';
import type { ChatMessage } from '../types';
import { SendIcon, LoadingSpinnerIcon, MicrophoneIcon } from './icons';

interface ChatInterfaceProps {
  dreamTranscription: string;
  dreamInterpretation: string;
}

// Helper function to encode raw audio data to base64
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper function to create a Blob for the API
function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] < 0 ? data[i] * 32768 : data[i] * 32767;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}


const ChatInterface: React.FC<ChatInterfaceProps> = ({ dreamTranscription, dreamInterpretation }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatRef.current = createChatSession(dreamTranscription, dreamInterpretation);
    setMessages([]); // Reset messages when dream context changes
  }, [dreamTranscription, dreamInterpretation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      const scrollHeight = textareaRef.current.scrollHeight;
      // Set a max height, e.g., 200px
      const maxHeight = 200;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
      // Allow scrolling if content exceeds max height
      textareaRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);


  const stopVoiceRecording = useCallback(async () => {
    if (!isVoiceRecording) return;
    setIsVoiceRecording(false);
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
        const session = await sessionPromiseRef.current;
        session.close();
        sessionPromiseRef.current = null;
    }
  }, [isVoiceRecording]);

  useEffect(() => {
    // Cleanup on component unmount to ensure resources are released
    return () => {
      stopVoiceRecording();
    };
  }, [stopVoiceRecording]);

  const startVoiceRecording = useCallback(async () => {
    setIsVoiceRecording(true);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    audioContextRef.current = audioContext;

                    const source = audioContext.createMediaStreamSource(stream);
                    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(audioContext.destination);
                    
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                },
                onmessage: (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        const { text, isFinal } = message.serverContent.inputTranscription;
                        if (isFinal && text) {
                            setInput(prev => (prev.trim() ? prev.trim() + ' ' : '') + text.trim() + ' ');
                        }
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Chat voice error:', e);
                    stopVoiceRecording();
                },
                onclose: () => {},
            },
            config: {
                responseModalities: [Modality.AUDIO], 
                inputAudioTranscription: {},
            },
        });
    } catch (error) {
        console.error("Failed to start voice recording:", error);
        setIsVoiceRecording(false);
    }
  }, [stopVoiceRecording]);


  const handleSend = useCallback(async () => {
    if (isVoiceRecording) {
      await stopVoiceRecording();
    }
    if (!input.trim() || isLoading || !chatRef.current) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatRef.current.sendMessage(input);
      const modelMessage: ChatMessage = { role: 'model', text: response.text };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = { role: 'model', text: "Sorry, I encountered an error. Please try again." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, chatRef, isVoiceRecording, stopVoiceRecording]);
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  };

  const handleMicClick = () => {
    if (isVoiceRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
  };


  return (
    <div className="bg-gray-800/80 rounded-xl flex flex-col h-full max-h-[calc(100vh-120px)] lg:max-h-full shadow-lg">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-pink-300">Explore Your Dream</h2>
        <p className="text-sm text-gray-400">Ask about symbols, feelings, or anything else.</p>
      </div>
      <div className="flex-grow p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="max-w-lg px-4 py-2 rounded-lg bg-gray-700 text-gray-200 flex items-center space-x-2">
                 <LoadingSpinnerIcon className="h-5 w-5"/>
                 <span>Thinking...</span>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 border-t border-gray-700">
        <div className={`flex items-start bg-gray-700 rounded-lg transition-all duration-300 ${isVoiceRecording ? 'ring-2 ring-inset ring-red-500' : ''}`}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isVoiceRecording ? "Listening..." : "Ask about a symbol..."}
            className="w-full bg-transparent p-3 focus:outline-none text-white placeholder-gray-400 resize-none"
            disabled={isLoading}
          />
          <button onClick={handleMicClick} disabled={isLoading} className="p-3 text-gray-400 hover:text-white disabled:text-gray-600 transition-colors" aria-label={isVoiceRecording ? "Stop voice input" : "Start voice input"}>
            <MicrophoneIcon className={`w-6 h-6 transition-colors ${isVoiceRecording ? 'text-red-400 hover:text-red-300 animate-pulse' : 'text-gray-400 hover:text-white'}`} />
          </button>
          <button onClick={handleSend} disabled={isLoading || !input.trim()} className="p-3 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors">
            <SendIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;