
import React, { useState, useEffect } from 'react';
import type { DreamEntry, AspectRatio } from '../types';
import ChatInterface from './ChatInterface';
import { marked } from 'marked';
import { LoadingSpinnerIcon, ShareIcon, SparklesIcon, StarIcon as StarSolidIcon, StarIcon as StarOutlineIcon } from './icons';
import { generateDreamImage } from '../services/geminiService';

interface DreamAnalysisProps {
  dream: DreamEntry;
  onReset: () => void;
  onUpdateDream: (updatedDream: DreamEntry) => void;
  artStyleOptions: Record<string, string>;
  aspectRatioOptions: { label: string; value: AspectRatio }[];
  examplePrompts: string[];
}

const DreamAnalysis: React.FC<DreamAnalysisProps> = ({ dream, onReset, onUpdateDream, artStyleOptions, aspectRatioOptions, examplePrompts }) => {
  const [showRegenOptions, setShowRegenOptions] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isContentLoaded, setIsContentLoaded] = useState(false);

  useEffect(() => {
    // Reset animation states when the dream entry changes
    setIsImageLoaded(false);
    setIsContentLoaded(false);
    
    // Stagger the content fade-in slightly for a smoother effect
    const timer = setTimeout(() => {
        setIsContentLoaded(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [dream.id]);


  const titleMatch = dream.interpretation.match(/\*\*Core Emotional Theme:\*\*\s*(.*)/);
  const initialPrompt = titleMatch ? titleMatch[1] : "";

  const [artStyle, setArtStyle] = useState<string>(artStyleOptions['Surrealist']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [customImagePrompt, setCustomImagePrompt] = useState(initialPrompt);


  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    setIsImageLoaded(false); // Reset for fade-in effect on new image
    try {
        const newImageUrl = await generateDreamImage(dream.transcription, artStyle, aspectRatio, customImagePrompt);
        const updatedDream = { ...dream, imageUrl: newImageUrl };
        onUpdateDream(updatedDream);
        setShowRegenOptions(false);
    } catch (err) {
        console.error("Error regenerating image:", err);
        setError("Failed to generate a new image. Please try again.");
    } finally {
        setIsRegenerating(false);
    }
  };

  const getSanitizedHtml = (markdown: string) => {
    // A simple configuration for marked
    const renderer = new marked.Renderer();
    renderer.heading = (text, level) => {
      const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
      if (level === 2) {
        return `<h${level} id="${escapedText}" class="text-2xl font-bold text-purple-300 mt-6 mb-2">${text}</h${level}>`;
      }
      if (level === 3) {
        return `<h${level} id="${escapedText}" class="text-xl font-semibold text-pink-300 mt-4 mb-2">${text}</h${level}>`;
      }
      return `<h${level} id="${escapedText}" class="text-lg font-medium mt-4 mb-2">${text}</h${level}>`;
    };
    renderer.paragraph = (text) => {
        return `<p class="text-gray-300 leading-relaxed mb-4">${text}</p>`;
    };
    renderer.strong = (text) => {
        return `<strong class="font-semibold text-white">${text}</strong>`;
    };
     renderer.list = (body, ordered) => {
      const tag = ordered ? 'ol' : 'ul';
      return `<${tag} class="list-disc list-inside mb-4 pl-4">${body}</${tag}>`;
    };
    renderer.listitem = (text) => {
        return `<li class="mb-2">${text}</li>`;
    }

    const html = marked(markdown, { renderer });
    return { __html: html };
  };

  const handleShare = async () => {
    if (!navigator.share) {
      alert("Sharing is not supported on your browser.");
      return;
    }
    
    const title = 'My Dreamscape from Lucid AI';
    const coreThemeMatch = dream.interpretation.match(/\*\*Core Emotional Theme:\*\*\s*(.*)/);
    const text = coreThemeMatch ? `I had a dream about: ${coreThemeMatch[1]}` : 'Check out this dream I analyzed with Lucid AI.';
    const url = window.location.href;

    try {
      // Convert data URL to blob to create a File object
      const response = await fetch(dream.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'dreamscape.jpg', { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text,
          url,
          files: [file],
        });
      } else {
        // Fallback for browsers that support share but not files
        await navigator.share({ title, text, url });
      }
    } catch (error) {
      // This error often happens if the user cancels the share action, so we don't need to show an alert.
      if ((error as DOMException).name !== 'AbortError') {
        console.error("Error sharing:", error);
        alert("An error occurred while trying to share.");
      }
    }
  };

  const handleToggleFavorite = () => {
    onUpdateDream({ ...dream, isFavorite: !dream.isFavorite });
  };


  return (
    <div className="w-full h-full max-w-7xl mx-auto flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
          Your Dreamscape
        </h1>
        <div className="flex items-center gap-2 md:gap-4">
          <button
            onClick={handleToggleFavorite}
            className="p-2 rounded-full hover:bg-yellow-400/20 text-gray-400 hover:text-yellow-400 transition-colors"
            aria-label={dream.isFavorite ? 'Unfavorite this dream' : 'Favorite this dream'}
          >
            {dream.isFavorite ? (
              <StarSolidIcon className="w-7 h-7 text-yellow-400" />
            ) : (
              <StarOutlineIcon className="w-7 h-7" />
            )}
          </button>
          {navigator.share && (
             <button
              onClick={handleShare}
              className="bg-pink-600 hover:bg-pink-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
              aria-label="Share dream"
            >
              <ShareIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
          <button
            onClick={onReset}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Back to Journal
          </button>
        </div>
      </div>

      <div className="flex-grow flex flex-col lg:flex-row gap-6 p-4 overflow-y-auto">
        {/* Left column: Image & Interpretation */}
        <div className="lg:w-1/2 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2">
          <div className="bg-black rounded-xl overflow-hidden shadow-2xl shadow-purple-900/20">
             <div className="relative">
                <img 
                    src={dream.imageUrl} 
                    alt="AI-generated surrealist representation of the dream" 
                    className={`w-full h-auto object-cover transition-opacity duration-1000 ease-in-out ${isImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setIsImageLoaded(true)}
                />
                {isRegenerating && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-4 text-center">
                        <LoadingSpinnerIcon className="h-10 w-10" />
                        <p className="mt-3 text-lg font-semibold">Painting a new vision...</p>
                    </div>
                )}
             </div>
             <div className="p-4 bg-gray-900/50">
                <button
                    onClick={() => setShowRegenOptions(!showRegenOptions)}
                    className="w-full bg-purple-800/80 hover:bg-purple-700/80 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <SparklesIcon className="w-5 h-5" />
                    <span>{showRegenOptions ? 'Cancel Regeneration' : 'Regenerate Image'}</span>
                </button>
                 {showRegenOptions && (
                    <div className="mt-4 space-y-6">
                        <div>
                          <label className="block text-center text-gray-400 mb-3 font-semibold">Artistic Style</label>
                          <div className="flex justify-center flex-wrap gap-2">
                            {Object.entries(artStyleOptions).map(([label, value]) => (
                              <button key={label} onClick={() => setArtStyle(value)} className={`px-3 py-1 text-xs rounded-full transition-colors duration-200 ${artStyle === value ? 'bg-purple-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label htmlFor="regen-prompt" className="block text-center text-gray-400 mb-3 font-semibold">Image Keywords</label>
                          <input id="regen-prompt" type="text" value={customImagePrompt} onChange={(e) => setCustomImagePrompt(e.target.value)} placeholder="e.g., a friendly dragon, vibrant colors" className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-3 text-center text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
                           <div className="flex justify-center flex-wrap gap-1 mt-2">
                            {examplePrompts.slice(0, 3).map((prompt) => (
                              <button key={prompt} onClick={() => setCustomImagePrompt(prompt)} className="px-2 py-1 text-[10px] rounded-full transition-colors bg-gray-700/60 text-gray-300 hover:bg-purple-800/50 hover:text-white">
                                {prompt}
                              </button>
                            ))}
                          </div>
                        </div>
                         <div>
                            <label className="block text-center text-gray-400 mb-3 font-semibold">Aspect Ratio</label>
                            <div className="flex justify-center gap-2">
                                {aspectRatioOptions.map(({ label, value }) => (
                                <button key={value} onClick={() => setAspectRatio(value)} className={`px-3 py-1 text-xs rounded-full transition-colors duration-200 ${aspectRatio === value ? 'bg-purple-600 text-white' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                                    {label}
                                </button>
                                ))}
                            </div>
                        </div>
                         {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                        <button onClick={handleRegenerate} disabled={isRegenerating} className="w-full bg-pink-600 hover:bg-pink-500 disabled:bg-pink-900 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                           {isRegenerating ? <><LoadingSpinnerIcon className="w-5 h-5" /><span>Generating...</span></> : 'Generate New Image'}
                        </button>
                    </div>
                )}
             </div>
          </div>
          <div className={`bg-gray-800/50 backdrop-blur-md border border-purple-800/30 p-6 rounded-xl prose prose-invert transition-opacity duration-1000 ease-in-out ${isContentLoaded ? 'opacity-100' : 'opacity-0'}`}>
             <h2 className="text-2xl font-bold text-purple-300 border-b border-gray-600 pb-2 mb-4">Psychological Interpretation</h2>
             <div dangerouslySetInnerHTML={getSanitizedHtml(dream.interpretation)} />
          </div>
           <div className={`bg-gray-800/80 p-6 rounded-xl transition-opacity duration-1000 ease-in-out ${isContentLoaded ? 'opacity-100' : 'opacity-0'}`}>
             <h2 className="text-xl font-bold text-purple-300 mb-2">Original Dream Transcription</h2>
             <p className="text-gray-400 italic">"{dream.transcription}"</p>
          </div>
        </div>

        {/* Right column: Chat */}
        <div className="lg:w-1/2 flex flex-col h-full">
          <ChatInterface dreamTranscription={dream.transcription} dreamInterpretation={dream.interpretation} />
        </div>
      </div>
    </div>
  );
};

export default DreamAnalysis;
