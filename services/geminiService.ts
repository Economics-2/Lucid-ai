
import { GoogleGenAI, Chat } from '@google/genai';
import type { AspectRatio } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateDreamImage(transcription: string, style: string, aspectRatio: AspectRatio, customPrompt: string): Promise<string> {
    let prompt = `A ${style}, high-resolution, emotionally evocative painting representing the core essence of this dream: "${transcription}"`;

    if (customPrompt.trim()) {
        prompt += `. Also, incorporate the following creative direction: "${customPrompt.trim()}"`;
    }
    
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio,
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    throw new Error("Image generation failed or returned no images.");
}

async function interpretDream(transcription: string): Promise<string> {
    const model = 'gemini-2.5-pro';
    const systemInstruction = `You are a dream interpreter specializing in Jungian psychology. Your analysis should be insightful, empathetic, and structured. Analyze the following dream, identifying key symbols and archetypes. Provide a structured interpretation in Markdown format covering these three sections: 
1.  **Core Emotional Theme:** What is the central feeling or mood of the dream?
2.  **Key Symbols and Archetypes:** Identify 2-3 major symbols or archetypal figures and explain their potential meanings in this context.
3.  **Potential Connection to Waking Life:** Suggest how the dream's themes might relate to the dreamer's current life challenges, feelings, or growth opportunities, posing them as gentle questions for reflection.`;

    const response = await ai.models.generateContent({
        model,
        contents: transcription,
        config: {
            systemInstruction,
        }
    });
    return response.text;
}

export async function generateDreamAnalysis(
    transcription: string,
    style: string,
    aspectRatio: AspectRatio,
    customPrompt: string
): Promise<{ imageUrl: string; interpretation: string; }> {
    try {
        // Run both tasks in parallel
        const [imageUrl, interpretation] = await Promise.all([
            generateDreamImage(transcription, style, aspectRatio, customPrompt),
            interpretDream(transcription)
        ]);
        return { imageUrl, interpretation };
    } catch (error) {
        console.error("Error in generateDreamAnalysis:", error);
        throw new Error("Failed to generate dream analysis.");
    }
}

export function createChatSession(dreamTranscription: string, dreamInterpretation: string): Chat {
    const model = 'gemini-2.5-flash';
    const chat = ai.chats.create({
        model,
        config: {
            systemInstruction: `You are a helpful assistant continuing a dream analysis. The user has just had a dream, which was transcribed and interpreted.
            
            ---
            DREAM TRANSCRIPTION:
            ${dreamTranscription}
            ---
            INITIAL INTERPRETATION:
            ${dreamInterpretation}
            ---
            
            The user will now ask follow-up questions. Your role is to provide further insight based on the context provided. Pay special attention to the 'Core Emotional Theme' and 'Key Symbols and Archetypes' identified in the initial interpretation when answering. Draw from psychological and symbolic knowledge, and keep your answers concise and conversational.`,
        },
    });
    return chat;
}