const EmailService = require('./emailService');

// Create a simple function to send OTP emails
const sendOTPEmail = async (email, otp, companyName = 'Your Company') => {
    const emailService = new EmailService();
    return await emailService.sendOTPEmail(email, otp, companyName);
};

module.exports = {
    sendOTPEmail
};
