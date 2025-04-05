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

// Add a knowledge base to enrich your agent's responses
const knowledgeBase = {
  products: {
    "product1": {
      name: "Premium Widget",
      price: "$99.99",
      features: ["Durable", "Lightweight", "Water-resistant"],
      availability: "In stock"
    },
    "product2": {
      name: "Deluxe Gadget",
      price: "$149.99",
      features: ["Smart connectivity", "Voice control", "Long battery life"],
      availability: "Limited stock"
    }
  },
  faq: {
    "return policy": "You can return any product within 30 days for a full refund.",
    "shipping": "We offer free shipping on all orders over $50.",
    "warranty": "All products come with a 1-year limited warranty."
  },
  locations: {
    "store1": {
      address: "123 Main Street, Anytown",
      hours: "Monday-Friday: 9am-6pm, Saturday: 10am-4pm",
      phone: "555-123-4567"
    }
  },
  // Add more categories as needed
};

// Function to extract relevant information from the knowledge base
function extractRelevantInfo(userInput) {
  if (!userInput) return null;
  
  const input = userInput.toLowerCase();
  let relevantInfo = [];
  
  // Check for product information
  Object.keys(knowledgeBase.products).forEach(productKey => {
    const product = knowledgeBase.products[productKey];
    if (input.includes(product.name.toLowerCase()) || input.includes(productKey.toLowerCase())) {
      relevantInfo.push(`Product Information - ${product.name}:
- Price: ${product.price}
- Features: ${product.features.join(", ")}
- Availability: ${product.availability}`);
    }
  });
  
  // Check for FAQ information
  Object.keys(knowledgeBase.faq).forEach(faqKey => {
    if (input.includes(faqKey)) {
      relevantInfo.push(`FAQ - ${faqKey}: ${knowledgeBase.faq[faqKey]}`);
    }
  });
  
  // Check for location information
  Object.keys(knowledgeBase.locations).forEach(locationKey => {
    const location = knowledgeBase.locations[locationKey];
    if (input.includes(locationKey) || input.includes("store") || input.includes("location")) {
      relevantInfo.push(`Store Information - ${locationKey}:
- Address: ${location.address}
- Hours: ${location.hours}
- Phone: ${location.phone}`);
    }
  });
  
  // Check for specific keywords and provide general information
  const keywords = {
    "pricing": "Our products range from $49.99 to $299.99 depending on features.",
    "discount": "We currently offer a 15% discount for first-time customers.",
    "sale": "Our annual sale is currently running with up to 30% off selected items."
  };
  
  Object.keys(keywords).forEach(keyword => {
    if (input.includes(keyword)) {
      relevantInfo.push(keywords[keyword]);
    }
  });
  
  return relevantInfo.length > 0 ? relevantInfo.join("\n\n") : null;
}

// OpenAI API integration
async function sendMessageToOpenAI(messages, systemPrompt, userInput) {
  try {
    // Extract relevant information from knowledge base based on user input
    const relevantInfo = extractRelevantInfo(userInput);
    
    // Append relevant information to system prompt if found
    let enhancedPrompt = systemPrompt;
    if (relevantInfo) {
      enhancedPrompt += "\n\nHere is some additional information that may be helpful:\n" + relevantInfo;
    }
    
    // Format messages for OpenAI API
    const formattedMessages = [
      { role: 'system', content: enhancedPrompt }
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
      model: 'gpt-4o',  // Use appropriate model - gpt-4o for best results
      messages: formattedMessages,
      max_tokens: 1000,
      temperature: 0.7
    });
    
    // Return response in a format similar to Claude for consistency
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
You are a helpful and friendly voice assistant speaking with someone over the phone.
Your responses should be concise, conversational, and optimized for speech.
Keep answers brief (2-3 sentences) unless asked for more detail.
Use natural, casual language and a friendly tone.
Avoid references to visual elements, links, or anything that wouldn't work in a voice call.
Speak in complete sentences that sound natural when read aloud.
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
      
      // Send to OpenAI API with the user input for context enrichment
      const aiResponse = await sendMessageToOpenAI(conversationHistory, SYSTEM_PROMPT, userInput);
      
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