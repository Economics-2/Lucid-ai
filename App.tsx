
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { DreamEntry, AspectRatio } from './types';
import { AppState } from './types';
import DreamRecorder from './components/DreamRecorder';
import DreamAnalysis from './components/DreamAnalysis';
import { generateDreamAnalysis } from './services/geminiService';
import { StarIcon as StarSolidIcon } from './components/icons';
import { StarIcon as StarOutlineIcon } from './components/icons';


// --- Local Storage Service ---
const DREAMS_KEY = 'lucid_ai_dreams';

function getSavedDreams(): DreamEntry[] {
  try {
    const savedDreams = localStorage.getItem(DREAMS_KEY);
    return savedDreams ? JSON.parse(savedDreams) : [];
  } catch (error) {
    console.error("Failed to parse dreams from local storage:", error);
    localStorage.removeItem(DREAMS_KEY);
    return [];
  }
}

function saveDreams(dreams: DreamEntry[]): void {
  try {
    localStorage.setItem(DREAMS_KEY, JSON.stringify(dreams));
  } catch (error) {
    console.error("Failed to save dreams to local storage:", error);
  }
}

function saveNewDream(newDream: DreamEntry): void {
  try {
    const existingDreams = getSavedDreams();
    const updatedDreams = [newDream, ...existingDreams];
    saveDreams(updatedDreams);
  } catch (error) {
    console.error("Failed to save dream to local storage:", error);
  }
}
// --- End Local Storage Service ---

// --- Art Generation Options ---
const artStyleOptions = {
  'Surrealist': 'surrealist, dream-like',
  'Abstract': 'abstract, non-representational',
  'Impressionist': 'impressionistic, painterly',
  'Gothic': 'dark, gothic, moody',
  'Cyberpunk': 'cyberpunk, futuristic, neon-lit',
};

const aspectRatioOptions: { label: string; value: AspectRatio }[] = [
  { label: 'Landscape', value: '16:9' },
  { label: 'Square', value: '1:1' },
  { label: 'Portrait', value: '9:16' },
];

const examplePrompts = [
    "A colossal whale in a starry nebula",
    "Glowing mushrooms in a hidden library",
    "Vintage sci-fi movie poster style",
    "A city made of crystal and light",
];
// --- End Art Generation Options ---


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [currentDream, setCurrentDream] = useState<DreamEntry | null>(null);
  const [allDreams, setAllDreams] = useState<DreamEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [artStyle, setArtStyle] = useState<string>(artStyleOptions['Surrealist']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [customImagePrompt, setCustomImagePrompt] = useState('');


  useEffect(() => {
    setAllDreams(getSavedDreams());
  }, []);

  const handleRecordingComplete = useCallback(async (transcription: string) => {
    if (!transcription.trim()) {
      setError("The recording was empty. Please try again.");
      setAppState(AppState.IDLE);
      return;
    }

    setAppState(AppState.ANALYZING);
    setError(null);

    try {
      const { imageUrl, interpretation } = await generateDreamAnalysis(transcription, artStyle, aspectRatio, customImagePrompt);
      
      const newDream: DreamEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        transcription,
        imageUrl,
        interpretation,
        isFavorite: false,
      };

      saveNewDream(newDream);
      setAllDreams(prev => [newDream, ...prev]);
      setCurrentDream(newDream);
      setAppState(AppState.VIEWING);

    } catch (err) {
      console.error("Error during dream analysis:", err);
      setError("There was an error analyzing your dream. Please check your API key and try again.");
      setAppState(AppState.IDLE);
    }
  }, [artStyle, aspectRatio, customImagePrompt]);

  const handleSelectDream = (dreamToView: DreamEntry) => {
    setCurrentDream(dreamToView);
    setAppState(AppState.VIEWING);
  };

  const handleGoHome = () => {
    setAppState(AppState.IDLE);
    setCurrentDream(null);
    setError(null);
  };
  
  const handleUpdateDream = (updatedDream: DreamEntry) => {
    setCurrentDream(updatedDream);
    const updatedDreams = allDreams.map(d => d.id === updatedDream.id ? updatedDream : d);
    setAllDreams(updatedDreams);
    saveDreams(updatedDreams);
  };

  const handleToggleFavorite = (dreamId: string) => {
    const updatedDreams = allDreams.map(d => 
      d.id === dreamId ? { ...d, isFavorite: !d.isFavorite } : d
    );
    setAllDreams(updatedDreams);
    saveDreams(updatedDreams);
  };

  const sortedDreams = useMemo(() => {
    return [...allDreams].sort((a, b) => {
      // Favorites come first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      // Then sort by date descending
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [allDreams]);

  const DreamHistoryItem: React.FC<{
    dream: DreamEntry, 
    onSelect: (dream: DreamEntry) => void,
    onToggleFavorite: (id: string) => void
  }> = ({ dream, onSelect, onToggleFavorite }) => {
    const dreamDate = new Date(dream.date);
    const titleMatch = dream.interpretation.match(/\*\*Core Emotional Theme:\*\*\s*(.*)/);
    const title = titleMatch ? titleMatch[1] : "A Recorded Dream";

    return (
      <div className="flex items-center gap-2">
         <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(dream.id);
          }}
          className="p-2 rounded-full hover:bg-yellow-400/20 text-gray-500 hover:text-yellow-400 transition-colors"
          aria-label={dream.isFavorite ? 'Unfavorite this dream' : 'Favorite this dream'}
        >
          {dream.isFavorite ? (
            <StarSolidIcon className="w-6 h-6 text-yellow-400" />
          ) : (
            <StarOutlineIcon className="w-6 h-6" />
          )}
        </button>
        <button 
          className="flex-grow bg-gray-800/60 p-4 rounded-lg hover:bg-purple-900/40 cursor-pointer transition-colors duration-200 text-left"
          onClick={() => onSelect(dream)}
          aria-label={`View dream from ${dreamDate.toLocaleString()}`}
        >
          <p className="font-semibold text-purple-300 truncate">{title}</p>
          <p className="text-sm text-gray-400">{dreamDate.toLocaleString()}</p>
          <p className="text-gray-300 mt-2 text-sm truncate italic">"{dream.transcription}"</p>
        </button>
      </div>
    );
  };


  const renderContent = () => {
    switch (appState) {
      case AppState.IDLE:
      case AppState.RECORDING: {
        const isRec = appState === AppState.RECORDING;
        return (
          <div className="flex flex-col items-center justify-start h-full w-full max-w-4xl mx-auto py-8">
            <div className='w-full px-4'>
              <h1 className={`text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2 text-center ${isRec ? 'animate-pulse' : ''}`}>
                Lucid AI Dream Journal
              </h1>
              <p className="text-lg text-gray-400 mb-8 text-center">
                {isRec ? 'Recording your dream...' : 'Choose your art style, then tap to record.'}
              </p>
              
               {!isRec && (
                <div className="w-full max-w-2xl mx-auto mb-8 px-4">
                  <div className="mb-6">
                    <label className="block text-center text-gray-400 mb-3 font-semibold">Artistic Style</label>
                    <div className="flex justify-center flex-wrap gap-3">
                      {Object.entries(artStyleOptions).map(([label, value]) => (
                        <button
                          key={label}
                          onClick={() => setArtStyle(value)}
                          className={`px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 ${
                            artStyle === value
                              ? 'bg-purple-600 text-white shadow-lg'
                              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                   <div className="mb-6">
                    <label htmlFor="custom-prompt" className="block text-center text-gray-400 mb-3 font-semibold">
                      Image Keywords (Optional)
                    </label>
                    <input
                      id="custom-prompt"
                      type="text"
                      value={customImagePrompt}
                      onChange={(e) => setCustomImagePrompt(e.target.value)}
                      placeholder="e.g., a friendly dragon, vibrant colors"
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-3 text-center text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex justify-center flex-wrap gap-2 mt-3">
                      <p className="text-xs text-gray-500 self-center mr-2">Try these:</p>
                        {examplePrompts.map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => setCustomImagePrompt(prompt)}
                            className="px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 bg-gray-700/60 text-gray-300 hover:bg-purple-800/50 hover:text-white hover:scale-105"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                  </div>
                  <div>
                    <label className="block text-center text-gray-400 mb-3 font-semibold">Aspect Ratio</label>
                    <div className="flex justify-center gap-3">
                      {aspectRatioOptions.map(({ label, value }) => (
                        <button
                          key={value}
                          onClick={() => setAspectRatio(value)}
                          className={`px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 ${
                            aspectRatio === value
                              ? 'bg-purple-600 text-white shadow-lg'
                              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <DreamRecorder 
                onRecordingStart={() => setAppState(AppState.RECORDING)} 
                onRecordingComplete={handleRecordingComplete} 
                initialState={isRec ? 'recording' : 'idle'}
              />
               {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
            </div>

             {sortedDreams.length > 0 && (
                <div className="w-full mt-12 flex-1 flex flex-col min-h-0 px-4">
                  <h2 className="text-2xl font-bold text-gray-200 mb-4 text-center">Dream History</h2>
                  <div className="space-y-4 overflow-y-auto pr-2">
                    {sortedDreams.map(dream => (
                      <DreamHistoryItem 
                        key={dream.id} 
                        dream={dream} 
                        onSelect={handleSelectDream}
                        onToggleFavorite={handleToggleFavorite} 
                      />
                    ))}
                  </div>
                </div>
              )}
          </div>
        );
      }
      case AppState.ANALYZING:
        return (
          <div className="text-center">
            <h2 className="text-3xl font-bold text-purple-400 mb-4">Analyzing Your Dream...</h2>
            <p className="text-gray-400">The AI is interpreting symbols and painting your dreamscape.</p>
             <div className="flex justify-center items-center mt-8">
              <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
        );
      case AppState.VIEWING:
        return currentDream && (
          <DreamAnalysis 
            dream={currentDream} 
            onReset={handleGoHome}
            onUpdateDream={handleUpdateDream}
            artStyleOptions={artStyleOptions}
            aspectRatioOptions={aspectRatioOptions}
            examplePrompts={examplePrompts}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="h-full w-full bg-gray-900 bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4">
       <div className="absolute inset-0 bg-[url('https://picsum.photos/1200/800?blur=10')] bg-cover opacity-10"></div>
       <div className="relative z-10 w-full h-full overflow-hidden">
         {renderContent()}
       </div>
    </main>
  );
};

export default App;
