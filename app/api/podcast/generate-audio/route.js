import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const maxDuration = 60;

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Two distinct voices for the podcast hosts
const VOICES = {
  sarah: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM", // Rachel (female)
  mike: process.env.ELEVENLABS_VOICE_MALE_ID || "pNInz6obpgDQGcFmaJgB", // Adam (male)
};

async function generateSpeech(text, voiceId) {
  const models = ["eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_monolingual_v1"];

  for (const model of models) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 100) return buffer;
      }
    } catch {}
  }
  return null;
}

// POST — generate podcast audio from script
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  const { script } = await request.json();
  if (!script || !Array.isArray(script) || script.length === 0) {
    return NextResponse.json({ error: "Script required" }, { status: 400 });
  }

  try {
    // Generate audio for each line sequentially
    const audioChunks = [];
    for (const line of script) {
      const speaker = line.speaker?.toLowerCase();
      const voiceId = VOICES[speaker] || VOICES.sarah;
      const text = line.text?.trim();
      if (!text) continue;

      const audio = await generateSpeech(text, voiceId);
      if (audio) {
        audioChunks.push(audio);
      }
    }

    if (audioChunks.length === 0) {
      return NextResponse.json({ error: "Failed to generate audio" }, { status: 500 });
    }

    // Concatenate all MP3 chunks
    const totalLength = audioChunks.reduce((s, c) => s + c.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return new NextResponse(combined.buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=604800", // Cache for 1 week
      },
    });
  } catch (error) {
    console.error("[Podcast Audio] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
