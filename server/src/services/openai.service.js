const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');

class OpenAIService {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    if (config.openai.apiKey) {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey,
      });
      logger.info('OpenAI service initialized');
    } else {
      logger.warn('OpenAI not configured. Set OPENAI_API_KEY in environment.');
    }
  }

  /**
   * Check if OpenAI is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.client;
  }

  /**
   * Generate template variations using AI
   * @param {Object} options
   * @param {string} options.prompt - User's prompt describing what they want
   * @param {string} options.channelType - EMAIL_SMTP, WHATSAPP_WEB, TELEGRAM, etc.
   * @param {number} options.count - Number of variations to generate
   * @returns {Promise<Array<{subject?: string, body: string}>>}
   */
  async generateTemplateVariations({ prompt, channelType, count = 10 }) {
    if (!this.client) {
      throw new Error('OpenAI not configured. Please set OPENAI_API_KEY.');
    }

    const isEmail = channelType === 'EMAIL_SMTP' || channelType === 'EMAIL_API';

    const systemPrompt = this.buildSystemPrompt(channelType, isEmail);
    const userPrompt = this.buildUserPrompt(prompt, count, isEmail);

    logger.info(`Generating ${count} ${channelType} template variations...`);

    try {
      const completion = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8, // Higher temperature for more variety
        max_tokens: 4000,
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const variations = this.parseVariations(responseText, isEmail);

      logger.info(`Generated ${variations.length} variations successfully`);
      return variations;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`Failed to generate variations: ${error.message}`);
    }
  }

  /**
   * Build system prompt based on channel type
   */
  buildSystemPrompt(channelType, isEmail) {
    const basePrompt = `You are a professional marketing copywriter. Your task is to generate multiple unique variations of marketing messages.

IMPORTANT RULES:
1. Each variation must be distinctly different in tone, approach, and wording
2. Keep messages professional yet engaging
3. Messages should be concise and impactful
4. Include personalization placeholders where appropriate:
   - {{contact.first_name}} or {{contact.name}} for recipient's name
   - {{lead.company_name}} for their company
   - {{sender.name}} for sender's name
   - {{company.name}} for your company name
5. Do NOT include any greeting like "Hi" or "Hello" with placeholder - start directly with the content or use the placeholder naturally
6. Avoid spam trigger words`;

    if (isEmail) {
      return `${basePrompt}

FOR EMAIL:
- Generate both a subject line and email body
- Subject lines should be compelling and under 60 characters
- Email body should be 2-4 short paragraphs
- Include a clear call-to-action`;
    }

    if (channelType === 'WHATSAPP_WEB' || channelType === 'WHATSAPP_BUSINESS') {
      return `${basePrompt}

FOR WHATSAPP:
- Keep messages short (under 300 characters ideal)
- Use a conversational, friendly tone
- Can use 1-2 emojis sparingly if appropriate
- Messages should feel personal, not like mass marketing`;
    }

    if (channelType === 'TELEGRAM') {
      return `${basePrompt}

FOR TELEGRAM:
- Messages can be slightly longer than WhatsApp
- Maintain professional but approachable tone
- Can use basic formatting (*bold*, _italic_)
- Include clear next steps or call-to-action`;
    }

    return basePrompt;
  }

  /**
   * Build user prompt with specific instructions
   */
  buildUserPrompt(prompt, count, isEmail) {
    if (isEmail) {
      return `Generate ${count} unique email variations based on this brief:

"${prompt}"

Return ONLY a JSON array with no additional text. Format:
[
  {"subject": "Subject line here", "body": "Email body here..."},
  {"subject": "Different subject", "body": "Different email body..."}
]

Generate exactly ${count} variations.`;
    }

    return `Generate ${count} unique message variations based on this brief:

"${prompt}"

Return ONLY a JSON array with no additional text. Format:
[
  {"body": "Message content here..."},
  {"body": "Different message here..."}
]

Generate exactly ${count} variations.`;
  }

  /**
   * Parse AI response into structured variations
   */
  parseVariations(responseText, isEmail) {
    try {
      // Try to extract JSON from the response
      let jsonStr = responseText.trim();

      // If response has markdown code blocks, extract the JSON
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Find the array in the response
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1) {
        jsonStr = jsonStr.substring(arrayStart, arrayEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Validate and clean variations
      return parsed.map((item, index) => {
        const variation = {
          body: String(item.body || item.message || item.content || '').trim(),
          sortOrder: index,
        };

        if (isEmail && item.subject) {
          variation.subject = String(item.subject).trim();
        }

        return variation;
      }).filter(v => v.body.length > 0);
    } catch (error) {
      logger.error('Failed to parse AI response:', error);
      logger.error('Raw response:', responseText);
      throw new Error('Failed to parse AI response. Please try again.');
    }
  }

  /**
   * Test the OpenAI connection
   */
  async testConnection() {
    if (!this.client) {
      return { success: false, error: 'OpenAI not configured' };
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: config.openai.model,
        messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        max_tokens: 10,
      });

      return {
        success: true,
        model: config.openai.model,
        response: completion.choices[0]?.message?.content,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set API key dynamically (for tenant-specific keys)
   */
  setApiKey(apiKey) {
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      logger.info('OpenAI client updated with new API key');
    }
  }

  /**
   * Test connection with a specific API key
   */
  async testWithKey(apiKey, model = null) {
    if (!apiKey) {
      return { success: false, error: 'No API key provided' };
    }

    const useModel = model || config.openai.model;

    try {
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: useModel,
        messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        max_tokens: 10,
      });

      return {
        success: true,
        working: true,
        model: useModel,
        response: completion.choices[0]?.message?.content,
      };
    } catch (error) {
      return { success: true, working: false, error: error.message };
    }
  }

  /**
   * Generate template variations with a specific API key
   */
  async generateTemplateVariationsWithKey({ prompt, channelType, count = 10, apiKey, model = null }) {
    if (!apiKey) {
      throw new Error('No API key provided');
    }

    const useModel = model || config.openai.model;
    const client = new OpenAI({ apiKey });
    const isEmail = channelType === 'EMAIL_SMTP' || channelType === 'EMAIL_API';

    const systemPrompt = this.buildSystemPrompt(channelType, isEmail);
    const userPrompt = this.buildUserPrompt(prompt, count, isEmail);

    logger.info(`Generating ${count} ${channelType} template variations with model ${useModel}...`);

    try {
      const completion = await client.chat.completions.create({
        model: useModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const variations = this.parseVariations(responseText, isEmail);

      logger.info(`Generated ${variations.length} variations successfully`);
      return variations;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`Failed to generate variations: ${error.message}`);
    }
  }
}

module.exports = new OpenAIService();
