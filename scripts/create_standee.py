import os
from PIL import Image, ImageDraw, ImageFont

artifact_dir = r'C:\Users\lalit\.gemini\antigravity-ide\brain\bde6e5b2-c453-4dcb-a1d5-24a040032276'
public_dir = r'D:\visitor\public'

qr_img_path = os.path.join(public_dir, 'visitor-qr-code.png')
qr_img = Image.open(qr_img_path).convert("RGBA")

# Card dimensions
W, H = 1400, 1850
card = Image.new("RGBA", (W, H), (255, 255, 255, 255))
draw = ImageDraw.Draw(card)

# Outer border / subtle accent frame
border_color = (226, 232, 240)
draw.rounded_rectangle([(30, 30), (W - 30, H - 30)], radius=36, fill=(248, 250, 252), outline=border_color, width=4)

# Inner white panel
draw.rounded_rectangle([(60, 60), (W - 60, H - 60)], radius=28, fill=(255, 255, 255), outline=(241, 245, 249), width=2)

# Load fonts (fallback to default if arial not found)
try:
    font_title = ImageFont.truetype("arial.ttf", 64)
    font_subtitle = ImageFont.truetype("arial.ttf", 36)
    font_instruction = ImageFont.truetype("arial.ttf", 34)
    font_url = ImageFont.truetype("arial.ttf", 30)
    font_badge = ImageFont.truetype("arialbd.ttf", 40)
except Exception:
    font_title = ImageFont.load_default()
    font_subtitle = ImageFont.load_default()
    font_instruction = ImageFont.load_default()
    font_url = ImageFont.load_default()
    font_badge = ImageFont.load_default()

# Header Pill
pill_w, pill_h = 420, 64
pill_x = (W - pill_w) // 2
pill_y = 110
draw.rounded_rectangle([(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)], radius=32, fill=(238, 242, 255))
draw.text((W // 2, pill_y + 32), "VISITOR MANAGEMENT", fill=(79, 70, 229), font=font_subtitle, anchor="mm")

# Main Title
draw.text((W // 2, 240), "Welcome to Esstee Exports", fill=(15, 23, 42), font=font_title, anchor="mm")
draw.text((W // 2, 310), "Self-Registration & Digital Pass", fill=(100, 116, 139), font=font_subtitle, anchor="mm")

# Divider line
draw.line([(180, 370), (W - 180, 370)], fill=(226, 232, 240), width=2)

# QR Code placement
qr_target_size = 880
qr_resized = qr_img.resize((qr_target_size, qr_target_size), Image.Resampling.LANCZOS)
qr_x = (W - qr_target_size) // 2
qr_y = 420

# QR code background card
draw.rounded_rectangle([(qr_x - 24, qr_y - 24), (qr_x + qr_target_size + 24, qr_y + qr_target_size + 24)], radius=24, fill=(255, 255, 255), outline=(226, 232, 240), width=3)
card.paste(qr_resized, (qr_x, qr_y), qr_resized)

# Bottom Instructions
draw.text((W // 2, 1400), "Scan with your phone camera to register", fill=(30, 41, 59), font=font_instruction, anchor="mm")
draw.text((W // 2, 1460), "Fast check-in • Instant digital pass • Host notification", fill=(100, 116, 139), font=font_subtitle, anchor="mm")

# URL Box
url_box_w, url_box_h = 780, 70
url_box_x = (W - url_box_w) // 2
url_box_y = 1530
draw.rounded_rectangle([(url_box_x, url_box_y), (url_box_x + url_box_w, url_box_y + url_box_h)], radius=16, fill=(241, 245, 249))
draw.text((W // 2, url_box_y + 35), "visitor-site-texplus.vercel.app/kiosk", fill=(71, 85, 105), font=font_url, anchor="mm")

# Footer
draw.text((W // 2, 1690), "VMS PRO SECURITY SYSTEM", fill=(148, 163, 184), font=font_url, anchor="mm")

standee_public = os.path.join(public_dir, 'visitor-registration-standee.png')
standee_artifact = os.path.join(artifact_dir, 'visitor-registration-standee.png')

card.save(standee_public, quality=95)
card.save(standee_artifact, quality=95)

print("Saved standee card to:", standee_public)
