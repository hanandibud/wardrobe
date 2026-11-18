import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'
import type { WeatherBand, WeatherCondition } from '../lib/weather'

/** Tailwind classes for a weather-band pill. Presentation only. */
export const bandClass: Record<WeatherBand, string> = {
  cold: 'border-forest/25 bg-forest/10 text-forest',
  cool: 'border-forest/25 bg-forest/10 text-forest',
  mild: 'border-accent/25 bg-accent-soft text-accent',
  warm: 'border-accent/25 bg-accent-soft text-accent',
  hot: 'border-accent/25 bg-accent-soft text-accent',
}

/** A weather icon for the current conditions, day or night. */
export function WeatherGlyph({
  condition,
  isDay,
  className,
}: {
  condition: WeatherCondition
  isDay: boolean
  className?: string
}) {
  if (condition === 'clear') {
    return isDay ? (
      <Sun className={className} strokeWidth={1.5} />
    ) : (
      <CloudMoon className={className} strokeWidth={1.5} />
    )
  }

  if (condition === 'cloudy') {
    return isDay ? (
      <CloudSun className={className} strokeWidth={1.5} />
    ) : (
      <Cloud className={className} strokeWidth={1.5} />
    )
  }

  if (condition === 'fog') {
    return <CloudFog className={className} strokeWidth={1.5} />
  }

  if (condition === 'drizzle') {
    return <CloudDrizzle className={className} strokeWidth={1.5} />
  }

  if (condition === 'rain') {
    return <CloudRain className={className} strokeWidth={1.5} />
  }

  if (condition === 'snow') {
    return <CloudSnow className={className} strokeWidth={1.5} />
  }

  return <CloudLightning className={className} strokeWidth={1.5} />
}
