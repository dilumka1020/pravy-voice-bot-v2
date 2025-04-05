// Environment variables configuration
require('dotenv').config();

// Import required packages
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Store conversations by call SID
const conversations = new Map();

// OpenAI integration
async function sendMessageToOpenAI(messages, systemPrompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error in sendMessageToOpenAI:', error);
    throw error;
  }
}

// Define system prompt for OpenAI
const SYSTEM_PROMPT = `
You are a smart and polite voice assistant for Pravy Consulting.
You greet callers in natural language, understand their business consulting needs, and answer questions based on services provided at https://pravy.ca.
Your responses should be concise, conversational, and optimized for speech.
Keep answers brief (2-3 sentences) unless asked for more detail.
Use natural, casual language and a friendly tone.
Avoid complex formatting or visual elements since your responses will be read aloud.
Prioritize clarity and direct answers to user queries.
If the user asks for more information, you can provide it in a follow-up message.
`;

// Handle initial call
app.post('/voice', (req, res) => {
  const twiml = new VoiceResponse();

  // Initialize conversation for this call
  const callSid = req.body.CallSid;
  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
  }

  // Welcome message
  twiml.say({
    voice: 'Polly.Kendra', language: 'en-US'
  }, 'Hi welcome to Pravy Consulting, how may I assist you today?');

  // Gather user input
  twiml.gather({
    input: 'speech',
    action: '/transcribe',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: 'true',
    language: 'en-US'
  });

  // Timeout handler
  twiml.redirect('/voice');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle transcription and response
app.post('/transcribe', async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const userInput = req.body.SpeechResult;

  try {
    if (!userInput || userInput.trim() === '') {
      twiml.say({ voice: 'Polly.Amy-Neural' }, 'I didn\'t catch that. Could you please repeat?');
      twiml.gather({
        input: 'speech',
        action: '/transcribe',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: 'true',
        language: 'en-US'
      });
      twiml.redirect('/voice');
    } else {
      console.log(`User said: ${userInput}`);

      let conversationHistory = conversations.get(callSid) || [];
      conversationHistory.push({ role: 'user', content: userInput });

      const assistantMessage = await sendMessageToOpenAI(conversationHistory, SYSTEM_PROMPT);
      console.log(`OpenAI responded: ${assistantMessage}`);

      conversationHistory.push({ role: 'assistant', content: assistantMessage });
      conversations.set(callSid, conversationHistory);

      twiml.say({ voice: 'Polly.Amy-Neural' }, assistantMessage);
      twiml.gather({
        input: 'speech',
        action: '/transcribe',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: 'true',
        language: 'en-US'
      });
      twiml.redirect('/voice');
    }
  } catch (error) {
    console.error('Error handling user input:', error);
    twiml.say({ voice: 'Polly.Amy-Neural' }, 'I\'m sorry, I\'m having trouble understanding you. Please try again later.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Clean up completed calls to prevent memory leaks
app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  if ([ 'completed', 'failed', 'busy', 'no-answer' ].includes(callStatus)) {
    if (conversations.has(callSid)) {
      conversations.delete(callSid);
      console.log(`Removed conversation history for call ${callSid}`);
    }
  }

  res.sendStatus(200);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Voice agent server running on port ${PORT}`);
});