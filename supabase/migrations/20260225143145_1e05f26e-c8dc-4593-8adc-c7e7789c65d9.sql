
CREATE OR REPLACE FUNCTION trigger_car_rental_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_type text;
  notification_data jsonb;
  base_url text;
  service_key text;
BEGIN
  -- Get the URL from vault or fallback
  base_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'https://wpwdxtyufpewdyffxlgo.supabase.co'
  );
  service_key := coalesce(
    current_setting('app.settings.service_role_key', true),
    current_setting('supabase.service_role_key', true),
    ''
  );

  -- If no service key available, skip notifications silently
  IF service_key = '' THEN
    RETURN NEW;
  END IF;

  -- Build notification data
  notification_data := jsonb_build_object(
    'requestId', NEW.id,
    'pickupLocation', NEW.pickup_location,
    'dropoffLocation', COALESCE(NEW.dropoff_location, NEW.pickup_location),
    'pickupDate', NEW.pickup_date::text,
    'dropoffDate', NEW.dropoff_date::text,
    'carType', COALESCE(NEW.car_type, 'Any'),
    'transmission', COALESCE(NEW.transmission, 'Any'),
    'contactEmail', NEW.contact_email,
    'contactPhone', NEW.contact_phone,
    'specialNotes', NEW.special_notes,
    'budget', NEW.budget,
    'quotedPrice', NEW.quoted_price,
    'rentalCompany', NEW.rental_company
  );

  IF TG_OP = 'INSERT' THEN
    BEGIN
      PERFORM net.http_post(
        url := base_url || '/functions/v1/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'type', 'car_rental_received',
          'customerEmail', NEW.contact_email,
          'data', notification_data,
          'entityType', 'car_rental',
          'entityId', NEW.id
        )
      );
      
      PERFORM net.http_post(
        url := base_url || '/functions/v1/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'type', 'admin_new_car_rental',
          'data', notification_data,
          'entityType', 'car_rental',
          'entityId', NEW.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't block the insert if notification fails
      RAISE WARNING 'Car rental notification failed: %', SQLERRM;
    END;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'quoted' THEN notification_type := 'car_rental_quote_ready';
      WHEN 'confirmed' THEN notification_type := 'car_rental_confirmed';
      WHEN 'cancelled' THEN notification_type := 'car_rental_cancelled';
      ELSE notification_type := NULL;
    END CASE;

    IF notification_type IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := base_url || '/functions/v1/send-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'type', notification_type,
            'customerEmail', NEW.contact_email,
            'data', notification_data,
            'entityType', 'car_rental',
            'entityId', NEW.id
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Car rental notification failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net;
