import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "DXFkLCBUTmvXpp2QwZjA";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ELEVENLABS_API_KEY) {
    console.log("[ElevenLabs] No API key configured");
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  const { text } = await request.json();

  if (!text || text.length > 5000) {
    return NextResponse.json({ error: "Text required (max 5000 chars)" }, { status: 400 });
  }

  // Try models in order of preference
  const models = ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"];

  for (const model of models) {
    try {
      console.log(`[ElevenLabs] Trying model: ${model}, voice: ${ELEVENLABS_VOICE_ID}`);

      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
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
        const contentType = res.headers.get("content-type");
        console.log(`[ElevenLabs] Success with ${model}, content-type: ${contentType}`);

        const audioBuffer = await res.arrayBuffer();
        return new NextResponse(audioBuffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-cache",
          },
        });
      }

      const errText = await res.text();
      console.log(`[ElevenLabs] Model ${model} failed (${res.status}): ${errText}`);
      // Try next model
    } catch (error) {
      console.log(`[ElevenLabs] Model ${model} error: ${error.message}`);
    }
  }

  // All models failed
  return NextResponse.json(
    { error: "All ElevenLabs models failed. Check API key and voice ID." },
    { status: 500 }
  );
}
