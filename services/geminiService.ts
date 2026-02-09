
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeAttendance = async (records: any[]) => {
  const prompt = `
    Analyze the following university attendance data and provide a brief summary of trends, 
    flagging any unusual patterns or low attendance rates.
    Data: ${JSON.stringify(records)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an academic advisor analyzing student attendance data. Be concise and professional.",
      }
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Could not perform AI analysis at this time.";
  }
};
