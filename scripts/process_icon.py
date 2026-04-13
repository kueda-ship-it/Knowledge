from PIL import Image, ImageDraw

def add_corners(im, rad):
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    alpha = Image.new('L', im.size, 255)
    w, h = im.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    im.putalpha(alpha)
    return im

def process_icon():
    input_path = "/Users/uedakohei/.gemini/antigravity/brain/5a8a4ada-a248-48bc-bd35-48bb7fbe2560/knowledge_icon_evolution_network_1776066416258.png"
    output_logo = "public/logo.png"
    output_favicon = "public/favicon.png"
    
    # Load image
    img = Image.open(input_path).convert("RGBA")
    
    # Square dimensions
    width, height = img.size
    
    # Radius (approx 20-25% for a nice squircle-like feel)
    radius = int(width * 0.2)
    
    # Apply rounded corners
    img_rounded = add_corners(img, radius)
    
    # Save files
    img_rounded.save(output_logo, "PNG")
    img_rounded.save(output_favicon, "PNG")
    print(f"Icons saved to {output_logo} and {output_favicon}")

if __name__ == "__main__":
    process_icon()
