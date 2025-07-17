const twilio = require('twilio');
require('dotenv').config();

class SMSService {
    constructor() {
        // Check if SMS credentials are available
        if (!process.env.TWILIO_ACCOUNT_SID) {
            console.warn('Twilio Account SID not found in environment variables');
            this.client = null;
            this.mockMode = true;
        } else if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
            // Use API Key credentials (more secure)
            console.log('Initializing Twilio with API Key credentials...');
            this.client = twilio(
                process.env.TWILIO_API_KEY_SID, 
                process.env.TWILIO_API_KEY_SECRET, 
                { accountSid: process.env.TWILIO_ACCOUNT_SID }
            );
            this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
            
            // If no phone number is available, use mock mode
            if (!this.fromNumber) {
                console.warn('Twilio phone number not set - using mock SMS mode');
                console.warn('To send real SMS, purchase a phone number from Twilio Console and add it to TWILIO_PHONE_NUMBER in .env');
                this.mockMode = true;
            } else {
                this.mockMode = false;
            }
        } else if (process.env.TWILIO_AUTH_TOKEN) {
            // Fallback to main auth token
            console.log('Initializing Twilio with main auth token...');
            this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
            
            if (!this.fromNumber) {
                console.warn('Twilio phone number not set - using mock SMS mode');
                this.mockMode = true;
            } else {
                this.mockMode = false;
            }
        } else {
            console.warn('No valid Twilio credentials found - using mock SMS mode');
            this.client = null;
            this.mockMode = true;
        }
    }

    /**
     * Clean and format Pakistani phone number
     * @param {string} phoneNumber - Raw phone number input
     * @returns {string} - Formatted phone number with +92 prefix
     */
    formatPakistaniNumber(phoneNumber) {
        // Remove all non-digit characters
        let cleanNumber = phoneNumber.replace(/\D/g, '');
        
        // Remove leading 92 if present
        if (cleanNumber.startsWith('92')) {
            cleanNumber = cleanNumber.substring(2);
        }
        
        // Remove leading 0 if present
        if (cleanNumber.startsWith('0')) {
            cleanNumber = cleanNumber.substring(1);
        }
        
        // Add +92 prefix
        return `+92${cleanNumber}`;
    }

    /**
     * Validate Pakistani mobile number format
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} - True if valid Pakistani mobile number
     */
    isValidPakistaniMobile(phoneNumber) {
        const formatted = this.formatPakistaniNumber(phoneNumber);
        // Pakistani mobile numbers: +92 3XX XXXXXXX (11 digits after +92)
        const pakistaniMobileRegex = /^\+923[0-9]{9}$/;
        return pakistaniMobileRegex.test(formatted);
    }

    /**
     * Send OTP SMS to Pakistani mobile number
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} otp - OTP code to send
     * @returns {Object} - Result object with success status
     */
    async sendOTP(phoneNumber, otp) {
        try {
            // Format the phone number
            const formattedNumber = this.formatPakistaniNumber(phoneNumber);
            
            // Validate the number
            if (!this.isValidPakistaniMobile(phoneNumber)) {
                throw new Error('Invalid Pakistani mobile number format');
            }

            // Use mock mode if no client or no phone number
            if (!this.client || this.mockMode) {
                // Mock SMS for development
                console.log('='.repeat(60));
                console.log('📱 MOCK SMS SENT SUCCESSFULLY');
                console.log('='.repeat(60));
                console.log(`📞 To: ${formattedNumber}`);
                console.log(`🔐 OTP: ${otp}`);
                console.log(`📝 Message: Your RIC E-Tender verification code is: ${otp}. This code will expire in 15 minutes. Do not share this code with anyone.`);
                console.log(`⏰ Sent at: ${new Date().toLocaleString()}`);
                console.log(`💡 Note: This is a mock SMS. To send real SMS, purchase a phone number from Twilio Console.`);
                console.log('='.repeat(60));
                
                return { 
                    success: true, 
                    messageId: 'mock-sms-' + Date.now(),
                    to: formattedNumber 
                };
            }

            // For actual Twilio implementation (when you have valid credentials AND phone number)
            const message = await this.client.messages.create({
                body: `Your RIC E-Tender verification code is: ${otp}. This code will expire in 15 minutes. Do not share this code with anyone.`,
                from: this.fromNumber,
                to: formattedNumber
            });

            console.log('SMS sent successfully to:', formattedNumber);
            console.log('Message SID:', message.sid);

            return {
                success: true,
                messageId: message.sid,
                to: formattedNumber
            };

        } catch (error) {
            console.error('Error sending SMS:', error);
            throw error;
        }
    }

    /**
     * Send verification SMS with custom message
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} message - Custom message to send
     * @returns {Object} - Result object with success status
     */
    async sendCustomMessage(phoneNumber, message) {
        try {
            const formattedNumber = this.formatPakistaniNumber(phoneNumber);
            
            if (!this.isValidPakistaniMobile(phoneNumber)) {
                throw new Error('Invalid Pakistani mobile number format');
            }

            // Use mock mode if no client or no phone number
            if (!this.client || this.mockMode) {
                // Mock SMS for development
                console.log('='.repeat(60));
                console.log('📱 MOCK CUSTOM SMS SENT');
                console.log('='.repeat(60));
                console.log(`📞 To: ${formattedNumber}`);
                console.log(`📝 Message: ${message}`);
                console.log(`⏰ Sent at: ${new Date().toLocaleString()}`);
                console.log(`💡 Note: This is a mock SMS. To send real SMS, purchase a phone number from Twilio Console.`);
                console.log('='.repeat(60));
                
                return { 
                    success: true, 
                    messageId: 'mock-custom-sms-' + Date.now(),
                    to: formattedNumber 
                };
            }

            const smsMessage = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: formattedNumber
            });

            console.log('Custom SMS sent successfully to:', formattedNumber);
            console.log('Message SID:', smsMessage.sid);

            return {
                success: true,
                messageId: smsMessage.sid,
                to: formattedNumber
            };

        } catch (error) {
            console.error('Error sending custom SMS:', error);
            throw error;
        }
    }
}

module.exports = new SMSService();
