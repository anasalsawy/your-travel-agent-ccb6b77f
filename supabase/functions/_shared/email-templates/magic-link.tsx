/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

const LOGO_URL = 'https://wpwdxtyufpewdyffxlgo.supabase.co/storage/v1/object/public/email-assets/logo.png'

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your magic link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} width="48" height="48" alt={siteName} style={logoImg} />
        </Section>
        <Heading style={h1}>Your sign-in link ✨</Heading>
        <Text style={text}>
          Tap below to sign in to {siteName}. This link expires shortly, so don't wait!
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Sign In
          </Button>
        </Section>
        <Text style={footer}>
          Didn't request this? You can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '40px 24px', maxWidth: '480px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '24px' }
const logoImg = { display: 'inline-block', borderRadius: '12px' }
const h1 = {
  fontFamily: "'Syne', 'Inter', Arial, sans-serif",
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#0A0F1C',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: '#555B6E',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const buttonSection = { textAlign: 'center' as const, margin: '28px 0' }
const button = {
  backgroundColor: '#3B82F6',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '32px 0 0' }
