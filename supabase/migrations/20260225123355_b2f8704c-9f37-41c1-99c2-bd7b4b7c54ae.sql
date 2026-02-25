
-- Create trigger function for car rental notifications
CREATE OR REPLACE FUNCTION public.trigger_car_rental_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_type text;
  notification_data jsonb;
BEGIN
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
    -- New request: notify customer + admin
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
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
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'type', 'admin_new_car_rental',
        'data', notification_data,
        'entityType', 'car_rental',
        'entityId', NEW.id
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Status changed
    CASE NEW.status
      WHEN 'quoted' THEN notification_type := 'car_rental_quote_ready';
      WHEN 'confirmed' THEN notification_type := 'car_rental_confirmed';
      WHEN 'cancelled' THEN notification_type := 'car_rental_cancelled';
      ELSE notification_type := NULL;
    END CASE;

    IF notification_type IS NOT NULL THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'type', notification_type,
          'customerEmail', NEW.contact_email,
          'data', notification_data,
          'entityType', 'car_rental',
          'entityId', NEW.id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS on_car_rental_notification ON public.car_rental_requests;
CREATE TRIGGER on_car_rental_notification
  AFTER INSERT OR UPDATE ON public.car_rental_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_car_rental_notification();
