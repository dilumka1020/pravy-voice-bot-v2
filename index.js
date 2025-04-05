// Environment variables configuration
require('dotenv').config();

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

// Conversation history management
class ConversationManager {
  constructor() {
    this.conversationHistory = [];
    this.maxHistoryLength = 10; // Adjust based on your needs
  }

  // Add a message to the conversation history
  addMessage(role, content) {
    if (!content || content.trim() === '') {
      throw new Error(`Cannot add empty ${role} message to conversation`);
    }
    
    this.conversationHistory.push({ role, content });
    
    // Trim history if it gets too long
    if (this.conversationHistory.length > this.maxHistoryLength * 2) {
      // Keep the first message for context and remove older messages
      const firstMessage = this.conversationHistory[0];
      this.conversationHistory = [
        firstMessage,
        ...this.conversationHistory.slice(-this.maxHistoryLength * 2 + 1)
      ];
    }
  }

  // Get the current conversation history
  getHistory() {
    return [...this.conversationHistory];
  }

  // Clear the conversation history
  clearHistory() {
    this.conversationHistory = [];
  }
}

// Voice agent implementation
class ClaudeVoiceAgent {
  constructor(systemPrompt = "You are a helpful voice assistant. Keep your responses concise and conversational, suitable for speech. Limit responses to 2-3 sentences when possible unless the user asks for more detail. Speak naturally as if having a conversation.") {
    this.conversationManager = new ConversationManager();
    this.systemPrompt = systemPrompt;
  }

  // Process user voice input
  async processVoiceInput(transcribedText) {
    try {
      if (!transcribedText || transcribedText.trim() === '') {
        return {
          success: false,
          response: "I didn't receive any input. Please try speaking again."
        };
      }

      // Add user message to conversation
      this.conversationManager.addMessage('user', transcribedText);
      
      // Get conversation history
      const messages = this.conversationManager.getHistory();
      
      // Send to Claude API with system prompt
      const claudeResponse = await sendMessageToClaude(messages, this.systemPrompt);
      
      // Extract the text response
      const assistantMessage = claudeResponse.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
      
      // Add assistant response to conversation history
      if (assistantMessage) {
        this.conversationManager.addMessage('assistant', assistantMessage);
      }
      
      return {
        success: true,
        response: assistantMessage
      };
    } catch (error) {
      console.error('Error processing voice input:', error);
      return {
        success: false,
        response: "Sorry, I'm having trouble understanding you. Please try again later.",
        error: error.message
      };
    }
  }

  // Reset the conversation
  resetConversation() {
    this.conversationManager.clearHistory();
    return "Conversation has been reset.";
  }

  // Update the system prompt if needed
  updateSystemPrompt(newPrompt) {
    this.systemPrompt = newPrompt;
    return "System prompt updated successfully.";
  }
}

// Example usage with Express server for a voice API endpoint
const express = require('express');
const app = express();
app.use(express.json());

// Define your custom system prompt here - you can customize this as needed
const SYSTEM_PROMPT = `
You are a helpful and friendly voice assistant for Pravy Consulting. 
Your responses should be concise, conversational, and optimized for speech.
Keep answers brief (2-3 sentences) unless asked for more detail.
Use natural, casual language and a friendly tone.
Avoid complex formatting or visual elements since your responses will be read aloud.
Prioritize clarity and direct answers to user queries.You can refer to https://pravyconsulting.com for more information about the company.
If the user asks for more information, you can provide it in a follow-up message.
`;

// Initialize the voice agent with custom prompt
const voiceAgent = new ClaudeVoiceAgent(SYSTEM_PROMPT);

// API endpoint to process voice input
app.post('/api/voice', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        message: 'No transcribed text provided' 
      });
    }
    
    const result = await voiceAgent.processVoiceInput(text);
    return res.json(result);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

// Reset conversation endpoint
app.post('/api/reset', (req, res) => {
  const message = voiceAgent.resetConversation();
  return res.json({ success: true, message });
});

// Update system prompt endpoint
app.post('/api/update-prompt', (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ 
      success: false, 
      message: 'No prompt provided' 
    });
  }
  
  const message = voiceAgent.updateSystemPrompt(prompt);
  return res.json({ success: true, message });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Voice agent server running on port ${PORT}`);
});

// Export for testing or importing in other files
module.exports = {
  ClaudeVoiceAgent,
  ConversationManager,
  sendMessageToClaude
};