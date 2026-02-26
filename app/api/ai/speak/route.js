import { NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Rachel voice - widely available on all plans
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

export async function POST(request) {
  if (!ELEVENLABS_API_KEY) {
    console.log("[ElevenLabs] No API key configured");
    return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  // Log first 8 chars of key for debugging (safe to log partial)
  console.log(`[ElevenLabs] API key starts with: ${ELEVENLABS_API_KEY.slice(0, 8)}...`);
  console.log(`[ElevenLabs] Voice ID: ${ELEVENLABS_VOICE_ID}`);

  const { text } = await request.json();

  if (!text || text.length > 5000) {
    return NextResponse.json({ error: "Text required (max 5000 chars)" }, { status: 400 });
  }

  // First, verify the API key works by checking user info
  try {
    const checkRes = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!checkRes.ok) {
      const errBody = await checkRes.text();
      console.log(`[ElevenLabs] API key validation FAILED: ${checkRes.status} ${errBody}`);
      return NextResponse.json({ 
        error: `ElevenLabs API key invalid (${checkRes.status}). Please check your key.`,
        detail: errBody.slice(0, 200)
      }, { status: 401 });
    }
    const user = await checkRes.json();
    console.log(`[ElevenLabs] API key valid. Subscription: ${user.subscription?.tier || "unknown"}, chars remaining: ${user.subscription?.character_count || "?"} / ${user.subscription?.character_limit || "?"}`);
  } catch (e) {
    console.log(`[ElevenLabs] Key check error: ${e.message}`);
  }

  // Try models in order: turbo (fastest), multilingual, monolingual
  const models = ["eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_monolingual_v1"];
  const errors = [];

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
      const errMsg = `Model ${model}: ${res.status} - ${errText.slice(0, 200)}`;
      console.log(`[ElevenLabs] ${errMsg}`);
      errors.push(errMsg);
    } catch (error) {
      const errMsg = `Model ${model}: ${error.message}`;
      console.log(`[ElevenLabs] ${errMsg}`);
      errors.push(errMsg);
    }
  }

  // All models failed — return detailed errors
  return NextResponse.json(
    { 
      error: "All ElevenLabs models failed",
      details: errors,
      voiceId: ELEVENLABS_VOICE_ID,
      keyPrefix: ELEVENLABS_API_KEY.slice(0, 8) + "...",
    },
    { status: 500 }
  );
}
