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
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

const LOGO_URL = 'https://wpwdxtyufpewdyffxlgo.supabase.co/storage/v1/object/public/email-assets/logo.png'

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} width="48" height="48" alt={siteName} style={logoImg} />
        </Section>
        <Heading style={h1}>You're invited! ✈️</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Accept below to create your account and start flying for less.
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Accept Invitation
          </Button>
        </Section>
        <Text style={footer}>
          Weren't expecting this? You can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: '#3B82F6', textDecoration: 'underline' }
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
