const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const { twiml } = require('twilio');

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Claude Response Handler
app.post('/voice', async (req, res) => {
  const response = new twiml.VoiceResponse();

  const callerSpeech = req.body.SpeechResult || req.body.Body || 'Hello';

  const prompt = `You are an intelligent and polite voice receptionist for Pravy Consulting and HelioZone. Someone just said: "${callerSpeech}". Reply professionally and ask relevant follow-up if needed. Keep it short and clear.`;

  try {
    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 250,
        messages: [
          { role: 'user', content: prompt }
        ]
      },
      {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const claudeReply = claudeRes.data?.content?.[0]?.text?.trim() || "I'm here to help you. Can you repeat that?";

    response.say({ voice: 'Polly.Joanna' }, claudeReply);
    response.redirect('/voice'); // loop back to listen again

  } catch (err) {
    console.error('Claude API error:', err.message);
    response.say("Sorry, I had trouble understanding. Please try again.");
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Health check route
app.get('/', (req, res) => {
  res.send('Claude bot is up!');
});

// Required by Render
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`✅ Server live at port ${port}`);
});