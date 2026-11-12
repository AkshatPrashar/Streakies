import nodemailer from 'nodemailer';
import Mailgen from 'mailgen';

const mailgen = new Mailgen({
  theme: 'default',
  product: {
    name: 'Streakies',
    link: 'http://localhost:3000',
    logo: 'https://placehold.co/200x200',
  },
});

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }
  return transporter;
};

export const sendVerificationEmail = async (email, verificationLink) => {
  const emailBody = mailgen.generate({
    body: {
      intro: 'Welcome to Streakies! Please verify your email.',
      action: {
        instructions: 'Click the button below to verify your email:',
        button: {
          color: '#D6FF4D',
          text: 'Verify Email',
          link: verificationLink,
        },
      },
      outro: 'This link expires in 20 minutes.',
    },
  });

  const mailOptions = {
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Email Verification - Streakies',
    html: emailBody,
  };

  return getTransporter().sendMail(mailOptions);
};

export const sendForgotPasswordEmail = async (email, resetLink) => {
  const emailBody = mailgen.generate({
    body: {
      intro: 'You requested a password reset. Here is your link.',
      action: {
        instructions: 'Click the button below to reset your password:',
        button: {
          color: '#D6FF4D',
          text: 'Reset Password',
          link: resetLink,
        },
      },
      outro: 'This link expires in 20 minutes. If you didn\'t request this, ignore this email.',
    },
  });

  const mailOptions = {
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Password Reset - Streakies',
    html: emailBody,
  };

  return getTransporter().sendMail(mailOptions);
};

export const sendLoginNotificationEmail = async (email) => {
  const emailBody = mailgen.generate({
    body: {
      intro: 'You just logged into your Streakies account.',
      action: {
        instructions: 'If this wasn\'t you, secure your account immediately.',
        button: {
          color: '#D6FF4D',
          text: 'Change Password',
          link: 'http://localhost:3000/change-password',
        },
      },
      outro: 'Stay safe!',
    },
  });

  const mailOptions = {
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Login Notification - Streakies',
    html: emailBody,
  };

  return getTransporter().sendMail(mailOptions);
};

export const sendLogoutNotificationEmail = async (email) => {
  const emailBody = mailgen.generate({
    body: {
      intro: 'You just logged out from your Streakies account.',
      outro: 'See you soon!',
    },
  });

  const mailOptions = {
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Logout Notification - Streakies',
    html: emailBody,
  };

  return getTransporter().sendMail(mailOptions);
};

// Recipient is the app owner's inbox. Set CONTACT_EMAIL in the deployment
// environment; falls back to MAIL_FROM if unset.
export const sendContactEmail = async (userEmail, userName, message) => {
  const recipient = process.env.CONTACT_EMAIL || process.env.MAIL_FROM;

  const emailBody = mailgen.generate({
    body: {
      intro: [
        'New message from the Streakies Contact form.',
        `From: ${userName} (${userEmail})`,
        message,
      ],
      outro: 'Reply directly to this email to respond to the user.',
    },
  });

  const mailOptions = {
    from: process.env.MAIL_FROM,
    to: recipient,
    replyTo: userEmail,
    subject: `[Streakies Contact] Message from ${userName}`,
    html: emailBody,
  };

  return getTransporter().sendMail(mailOptions);
};
