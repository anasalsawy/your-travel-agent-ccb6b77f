-- Add telegram_chat_id to sellers table to link Telegram accounts
ALTER TABLE public.sellers 
ADD COLUMN telegram_chat_id bigint UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_sellers_telegram_chat_id ON public.sellers(telegram_chat_id);