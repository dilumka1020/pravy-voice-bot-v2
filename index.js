// Environment variables configuration
require('dotenv').config();

// Import required packages
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Initialize express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Store conversations by call SID
const conversations = new Map();

// Claude API integration
async function sendMessageToClaude(messages, systemPrompt) {
  try {
    // Validate messages to ensure non-empty content
    if (!messages.length || !messages[0].content || messages[0].content.length === 0) {
      throw new Error("First message must have non-empty content");
    }
    
    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        messages: messages,
        max_tokens: 1000,
        system: systemPrompt
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API Error:', errorData);
      throw new Error(`Claude API request failed: ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in sendMessageToClaude:', error);
    throw error;
  }
}

// Define system prompt for Claude
const SYSTEM_PROMPT = `
You are a helpful and friendly voice assistant for Pravy Consulting. 
You greet callers, understand their business consulting needs, and answer questions based on services provided at https://pravy.ca.
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
    voice: 'Polly.Amy-Neural',
  }, 'Hello! I\'m your AI assistant. How can I help you today?');
  
  // Gather user input
  const gather = twiml.gather({
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
    // Check if input was received
    if (!userInput || userInput.trim() === '') {
      twiml.say({
        voice: 'Polly.Amy-Neural',
      }, 'I didn\'t catch that. Could you please repeat?');
      
      const gather = twiml.gather({
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
      
      // Get conversation history for this call
      let conversationHistory = conversations.get(callSid) || [];
      
      // Add user message to conversation
      conversationHistory.push({
        role: 'user',
        content: userInput
      });
      
      // Send to Claude API
      const claudeResponse = await sendMessageToClaude(conversationHistory, SYSTEM_PROMPT);
      
      // Extract text from Claude's response
      const assistantMessage = claudeResponse.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
      
      console.log(`Claude responded: ${assistantMessage}`);
      
      // Add Claude response to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });
      
      // Update conversation history
      conversations.set(callSid, conversationHistory);
      
      // Speak Claude's response
      twiml.say({
        voice: 'Polly.Amy-Neural',
      }, assistantMessage);
      
      // Get more input
      const gather = twiml.gather({
        input: 'speech',
        action: '/transcribe',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: 'true',
        language: 'en-US'
      });
      
      // Fallback if no input received
      twiml.redirect('/voice');
    }
  } catch (error) {
    console.error('Error handling user input:', error);
    
    twiml.say({
      voice: 'Polly.Amy-Neural',
    }, 'I\'m sorry, I\'m having trouble understanding you. Please try again later.');
    
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Clean up completed calls to prevent memory leaks
app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
    // Remove conversation history for this call
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