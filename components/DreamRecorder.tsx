
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, Modality, Blob, LiveServerMessage } from '@google/genai';
import { MicrophoneIcon, StopIcon } from './icons';

interface DreamRecorderProps {
  onRecordingStart: () => void;
  onRecordingComplete: (transcription: string) => void;
  initialState?: 'idle' | 'recording';
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


const DreamRecorder: React.FC<DreamRecorderProps> = ({ onRecordingStart, onRecordingComplete, initialState = 'idle' }) => {
  const [isRecording, setIsRecording] = useState(initialState === 'recording');
  const [finalTranscription, setFinalTranscription] = useState('');
  const [interimTranscription, setInterimTranscription] = useState('');
  const [sensitivity, setSensitivity] = useState(1.0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const transcriptionRef = useRef('');
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    
    setIsRecording(false);
    setAudioLevel(0);

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (analyserNodeRef.current) {
        analyserNodeRef.current.disconnect();
        analyserNodeRef.current = null;
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

    onRecordingComplete(transcriptionRef.current.trim());
  }, [isRecording, onRecordingComplete]);

  const startRecording = useCallback(async () => {
    onRecordingStart();
    setIsRecording(true);
    setFinalTranscription('');
    setInterimTranscription('');
    transcriptionRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false, // We control gain manually with the slider
        },
      });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      sessionPromiseRef.current = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
              onopen: () => {
                  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                  audioContextRef.current = audioContext;

                  const source = audioContext.createMediaStreamSource(stream);
                  gainNodeRef.current = audioContext.createGain();
                  analyserNodeRef.current = audioContext.createAnalyser();
                  scriptProcessorRef.current = audioContext.createScriptProcessor(4096, 1, 1);
                  
                  gainNodeRef.current.gain.value = sensitivity;
                  analyserNodeRef.current.fftSize = 256;
                  const bufferLength = analyserNodeRef.current.frequencyBinCount;
                  const dataArray = new Uint8Array(bufferLength);
                  
                  // Connect audio graph
                  source.connect(gainNodeRef.current);
                  gainNodeRef.current.connect(scriptProcessorRef.current);
                  scriptProcessorRef.current.connect(audioContext.destination);
                  gainNodeRef.current.connect(analyserNodeRef.current);
                  
                  scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                      const pcmBlob = createBlob(inputData);
                      sessionPromiseRef.current?.then((session) => {
                          session.sendRealtimeInput({ media: pcmBlob });
                      });
                  };
                  
                  const visualize = () => {
                      if (!analyserNodeRef.current) return;
                      animationFrameIdRef.current = requestAnimationFrame(visualize);
                      analyserNodeRef.current.getByteFrequencyData(dataArray);
                      const sum = dataArray.reduce((a, b) => a + b, 0);
                      const average = sum / bufferLength;
                      setAudioLevel(Math.min(1, average / 128)); // Normalize to ~0-1
                  };
                  visualize();
              },
              onmessage: (message: LiveServerMessage) => {
                  if (message.serverContent?.inputTranscription) {
                      const { text, isFinal } = message.serverContent.inputTranscription;
                       if (isFinal) {
                           transcriptionRef.current += text + ' ';
                           setFinalTranscription(transcriptionRef.current);
                           setInterimTranscription('');
                       } else {
                           setInterimTranscription(text);
                       }
                  }
              },
              onerror: (e: ErrorEvent) => {
                  console.error('Live session error:', e);
                  stopRecording();
              },
              onclose: () => {
                  // Connection closed.
              },
          },
          config: {
              responseModalities: [Modality.AUDIO], 
              inputAudioTranscription: {},
          },
      });
    } catch (error) {
        console.error("Failed to start recording:", error);
        setIsRecording(false);
    }
  }, [onRecordingStart, stopRecording, sensitivity]);

   useEffect(() => {
    if (initialState === 'recording' && !isRecording) {
      startRecording();
    }
  }, [initialState, isRecording, startRecording]);

  useEffect(() => {
    if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = sensitivity;
    }
  }, [sensitivity]);

  return (
    <div className="flex flex-col items-center w-full max-w-2xl">
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4 focus:ring-purple-500/50 bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isRecording ? (
          <StopIcon className="w-10 h-10 text-white animate-pulse" />
        ) : (
          <MicrophoneIcon className="w-10 h-10 text-white" />
        )}
      </button>
      {isRecording && (
        <div className="mt-6 w-full space-y-4">
           <div className="flex flex-col items-center">
             <label htmlFor="sensitivity" className="text-sm text-gray-400 mb-2">Mic Sensitivity</label>
             <input
                id="sensitivity"
                type="range"
                min="0"
                max="2.5"
                step="0.1"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                className="w-1/2 accent-purple-500 cursor-pointer"
             />
           </div>

          <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-transform duration-75"
              style={{ transform: `scaleX(${audioLevel})`, transformOrigin: 'left' }}
            ></div>
          </div>

          <div className="w-full bg-gray-800/50 p-4 rounded-lg min-h-[100px] text-left text-gray-300 italic" aria-live="polite">
            {finalTranscription || interimTranscription ? (
              <>
                <span>{finalTranscription}</span>
                <span className="text-gray-500">{interimTranscription}</span>
              </>
            ) : "Listening..."}
          </div>
        </div>
      )}
    </div>
  );
};

export default DreamRecorder;
