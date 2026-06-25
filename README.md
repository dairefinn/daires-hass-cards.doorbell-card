# Doorbell card

A camera + doorbell + motion sensor card for Home Assistant. Displays a live camera thumbnail alongside binary sensor states for the doorbell and motion detector.

## Installation

### HACS (recommended)

1. In Home Assistant, go to **HACS → Frontend → ⋮ → Custom repositories**
2. Add this repository URL and set the category to **Lovelace**
3. Click **Download** on the doorbell-card entry
4. Restart Home Assistant

### Manual

1. Copy `doorbell-card.js` to your Home Assistant `config/www/` folder.
2. Add the resource in your Lovelace dashboard:
   - **Settings → Dashboards → Resources → Add Resource**
   - URL: `/local/doorbell-card.js`
   - Type: `JavaScript module`

## Configuration

At least one of `camera`, `doorbell`, or `motion` is required.

| Option | Type | Default | Description |
|---|---|---|---|
| `camera` | string | — | Camera entity ID (`camera.*`) |
| `doorbell` | string | — | Doorbell binary sensor entity ID |
| `motion` | string | — | Motion binary sensor entity ID |
| `title` | string | entity name | Card title |
| `interactions` | list | — | Tap/hold/double-tap actions (see below) |

## Interactions

Attach actions to `tap`, `hold` (500 ms), or `double_tap` events by adding an `interactions` list.

```yaml
interactions:
  - trigger: tap        # tap | hold | double_tap  (default: tap)
    action: more-info   # see action reference below
```

| Action | Extra fields | Description |
|---|---|---|
| `more-info` | `entity` (optional) | Open the HA more-info dialog. Defaults to `doorbell` → `camera` → `motion`. |
| `toggle` | `entity` (optional) | Toggle the entity. |
| `call-service` | `service`, `service_data` | Call any HA service. `service` is `domain.service` format. |
| `navigate` | `path` | Navigate to a Lovelace path, e.g. `/lovelace/cameras`. |
| `url` | `url`, `target` | Open a URL. `target` defaults to `_blank`. |
| `none` | — | Explicit no-op. |

## Examples

**Camera + sensors:**
```yaml
type: custom:daires-hass-cards-doorbell-card
title: Front Door
camera: camera.front_door
doorbell: binary_sensor.front_doorbell
motion: binary_sensor.front_motion
```

**Sensors only:**
```yaml
type: custom:daires-hass-cards-doorbell-card
doorbell: binary_sensor.front_doorbell
motion: binary_sensor.front_motion
```

**With interactions:**
```yaml
type: custom:daires-hass-cards-doorbell-card
camera: camera.front_door
doorbell: binary_sensor.front_doorbell
motion: binary_sensor.front_motion
interactions:
  - trigger: tap
    action: more-info
    entity: camera.front_door
  - trigger: hold
    action: navigate
    path: /lovelace/cameras
```

## Demo

Open `demo.html` in a browser to preview the card without Home Assistant.
