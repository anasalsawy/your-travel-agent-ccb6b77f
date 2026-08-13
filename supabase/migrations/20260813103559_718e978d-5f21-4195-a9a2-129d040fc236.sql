UPDATE public.ai_router_settings
SET default_model = 'Qwen/Qwen3-VL-30B-A3B-Instruct',
    auto_select = false,
    fallback_models = ARRAY['Qwen/Qwen3-VL-30B-A3B-Instruct','Qwen/Qwen2.5-32B-Instruct'],
    max_attempts = 3;