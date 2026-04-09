# Hover TTS Module

Muc tieu cua module nay la tach rieng toan bo logic Text-to-Speech khoi Reading UI de de bao tri va de thay the provider sau nay.

## Cau truc thu muc

- `config.js`
  - Cau hinh tap trung cho Hover TTS.
  - Doc bien moi truong va quy doi ve gia tri an toan.
- `providers/googleTranslateTtsProvider.js`
  - Adapter cho Google Translate TTS endpoint.
  - Chuan hoa text, chia nho segment, tao URL audio.
- `core/createHoverTtsAudioEngine.js`
  - Engine phat audio dung lai, phat tiep theo segment.
  - Xu ly stop delay cho hover leave va don vong doi audio.

## Nguyen tac thiet ke

- Hook UI (`hooks/useHoverSpeech.js`) chi dieu phoi event hover.
- Provider va audio engine doc lap de test va thay doi de dang.
- Khong hard-code API URL trong UI component.

## Bien moi truong ho tro

- `VITE_HOVER_TTS_STOP_DELAY_MS`
  - Do tre truoc khi stop audio khi roi chuot khoi tu.
- `VITE_HOVER_TTS_PLAYBACK_RATE`
  - Toc do phat audio.
- `VITE_HOVER_NATIVE_VOICE_NAME_HINT`
  - Goi y ten voice native uu tien (vi du: `HoaiMy`, `Vietnamese`).
- `VITE_GOOGLE_TRANSLATE_TTS_BASE_URL`
  - Mac dinh: `https://translate.googleapis.com/translate_tts`.
- `VITE_GOOGLE_TRANSLATE_TTS_CLIENT`
  - Mac dinh: `tw-ob`.
- `VITE_GOOGLE_TRANSLATE_TTS_MAX_CHARS`
  - So ky tu toi da cho moi request audio.

## Ghi chu van hanh

- Google Translate TTS endpoint la dich vu ben thu ba va co the thay doi hanh vi.
- Neu can do tin cay cao, nen bo sung backend proxy hoac provider co SLA ro rang.
- Trinh duyet co the chan autoplay audio; can co it nhat mot thao tac click de unlock audio context.
