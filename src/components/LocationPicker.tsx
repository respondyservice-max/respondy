'use client';

import { useEffect, useRef, useState } from 'react';

interface LocationPickerProps {
  defaultValue: string;
  onLocationSelect: (address: string) => void;
}

declare global {
  interface Window {
    google: any;
  }
}

export default function LocationPicker({ defaultValue, onLocationSelect }: LocationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    let scriptLoaded = false;

    const initAutocomplete = () => {
      if (!inputRef.current || !window.google?.maps?.places) return;

      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        fields: ['formatted_address', 'geometry'],
      });

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (place.formatted_address) {
          setInputValue(place.formatted_address);
          onLocationSelect(place.formatted_address);
        }
      });

      // Prevenir que el formulario se envíe al presionar Enter en las sugerencias
      inputRef.current.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
      });
    };

    if (window.google?.maps?.places) {
      initAutocomplete();
    } else {
      const existingScript = document.getElementById('google-maps-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => initAutocomplete();
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initAutocomplete);
      }
    }

    return () => {
      // Cleanup si es necesario
    };
  }, [onLocationSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        onLocationSelect(e.target.value); // Mantener sincronizado si escriben a mano
      }}
      placeholder="Busca tu dirección..."
      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
    />
  );
}
