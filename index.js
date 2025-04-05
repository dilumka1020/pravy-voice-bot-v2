// Environment variables configuration
require('dotenv').config();

// Import required packages
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

// Initialize express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store conversations by call SID
const conversations = new Map();

// OpenAI API integration
async function sendMessageToOpenAI(messages, systemPrompt) {
  try {
    // Format messages for OpenAI API
    const formattedMessages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add conversation history
    messages.forEach(msg => {
      formattedMessages.push({ 
        role: msg.role, 
        content: msg.content 
      });
    });
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // Use appropriate model - can replace with gpt-3.5-turbo for cost efficiency
      messages: formattedMessages,
      max_tokens: 1000,
      temperature: 0.7
    });
    
    // Return response in a format similar to what we expect
    return {
      content: [
        {
          type: 'text',
          text: response.choices[0].message.content
        }
      ]
    };
  } catch (error) {
    console.error('Error in sendMessageToOpenAI:', error);
    throw error;
  }
}

// Define system prompt for the AI
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
    voice: 'Polly.Matthew',
  }, 'Hi, Welcome to Pravy Consulting... How may I assist you today?');
  
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
        voice: 'Polly.Matthew',
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
      
      // Send to OpenAI API
      const aiResponse = await sendMessageToOpenAI(conversationHistory, SYSTEM_PROMPT);
      
      // Extract text from AI response
      const assistantMessage = aiResponse.content[0].text;
      
      console.log(`AI responded: ${assistantMessage}`);
      
      // Add AI response to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });
      
      // Update conversation history
      conversations.set(callSid, conversationHistory);
      
      // Keep conversation history manageable by limiting size
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
        conversations.set(callSid, conversationHistory);
      }
      
      // Speak AI's response
      twiml.say({
        voice: 'Polly.Matthew',
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
      voice: 'Polly.Matthew',
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