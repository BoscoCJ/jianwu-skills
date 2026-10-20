import argparse
import hashlib
import json
import math
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET


parser = argparse.ArgumentParser(description='Verify a native editable HTML-to-PPTX export.')
parser.add_argument('pptx', type=Path)
arguments = parser.parse_args()
deck = arguments.pptx.resolve()
directory = deck.with_name(deck.stem + '-artifacts')
manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
source = json.loads((directory / 'source-layout.json').read_text(encoding='utf-8'))
namespaces = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
              'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}


def normalized(value):
    return re.sub(r'\s+', '', value)


report = {'slides': [], 'warnings': manifest['warnings'], 'structural_passed': False, 'visual_status': 'not_run', 'all_passed': False, 'errors': []}
expected_hashes = {image['sha256'] for image in manifest['media']}
try:
    with zipfile.ZipFile(deck) as archive:
        assert archive.testzip() is None, 'Corrupted ZIP archive'
        for name in archive.namelist():
            if name.endswith('.xml'):
                ET.fromstring(archive.read(name))
            if name.startswith('ppt/media/') and not name.endswith('/'):
                assert hashlib.sha256(archive.read(name)).hexdigest() in expected_hashes, f'Non-original image: {name}'
        slides = [name for name in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', name)]
        assert len(slides) == len(source), 'Slide count mismatch'
        for index, expected in enumerate(source, start=1):
            slide = ET.fromstring(archive.read(f'ppt/slides/slide{index}.xml'))
            shapes = slide.findall('.//p:sp', namespaces)
            text_shapes = [shape for shape in shapes if shape.find('.//a:t', namespaces) is not None]
            operations = [operation for operation in expected['operations'] if operation['type'] == 'text' and operation['text'].strip()]
            actual_text = normalized(''.join(slide.itertext()))
            assert actual_text == normalized(''.join(operation['text'] for operation in operations)), f'Slide {index}: missing or changed native text'
            logical_operations = sorted(operations, key=lambda operation: operation.get('readingOrder', 0)) if all('readingOrder' in operation for operation in operations) else operations
            assert normalized(''.join(operation['text'] for operation in logical_operations)) == normalized(expected['text']), f'Slide {index}: source text completeness mismatch'
            assert len(text_shapes) == len(operations), f'Slide {index}: editable text object mismatch'
            for shape, operation in zip(text_shapes, operations):
                expected_runs = operation.get('runs', [operation])
                xml_runs = shape.findall('.//a:r', namespaces)
                character_properties = []
                for run in xml_runs:
                    character_properties.extend([run.find('a:rPr', namespaces)] * len(normalized(''.join(run.itertext()))))
                assert normalized(''.join(shape.itertext())) == normalized(operation['text']), operation['text']
                cursor = 0
                for run in expected_runs:
                    for character in normalized(run['text']):
                        properties = character_properties[cursor]
                        cursor += 1
                        assert abs(int(properties.attrib['sz']) - run['fontSize'] * 75) <= 1, run['text']
                        assert run['fontSize'] >= manifest['minimumFont'] - 0.01, run['text']
                        for slot in ['latin', 'ea', 'cs']:
                            assert properties.find(f'a:{slot}', namespaces).attrib['typeface'] == run.get('fontFace', manifest['fontFace']), run['text']
                        fill = properties.find('a:solidFill/a:srgbClr', namespaces)
                        channels = [int(value) for value in re.findall(r'\d+', run['color'])[:3]]
                        assert fill.attrib['val'].upper() == ''.join(f'{value:02X}' for value in channels), run['text']
                        css_alpha = re.findall(r'[\d.]+', run['color'])
                        expected_alpha = (float(css_alpha[3]) if len(css_alpha) == 4 else 1) * run['opacity'] * 100000
                        alpha = fill.find('a:alpha', namespaces)
                        actual_alpha = int(alpha.attrib['val']) if alpha is not None else 100000
                        assert abs(actual_alpha - expected_alpha) <= 1, f"Alpha mismatch: {run['text']}"
                        if run.get('highlight'):
                            highlight = properties.find('a:highlight/a:srgbClr', namespaces)
                            highlight_channels = [int(value) for value in re.findall(r'\d+', run['highlight'])[:3]]
                            assert highlight is not None and highlight.attrib['val'].upper() == ''.join(f'{value:02X}' for value in highlight_channels), 'Highlight mismatch'
                assert shape.find('.//a:noAutofit', namespaces) is not None, operation['text']
                assert shape.find('.//a:normAutofit', namespaces) is None, operation['text']
                assert shape.find('.//a:spAutoFit', namespaces) is None, operation['text']
                transform = shape.find('.//a:xfrm', namespaces)
                actual_rotation = int(transform.attrib.get('rot', '0')) / 60000
                assert abs((actual_rotation - operation.get('rotate', 0) + 180) % 360 - 180) < 0.02, 'Text rotation mismatch'
            for operation in expected['operations']:
                if operation['type'] != 'image' or 'pptxPlacement' not in operation:
                    continue
                pictures = slide.findall('.//p:pic', namespaces)
                picture = next(picture for picture in pictures if picture.find('p:nvPicPr/p:cNvPr', namespaces).attrib['name'] == operation['objectName'])
                transform = picture.find('.//a:xfrm', namespaces)
                offset = transform.find('a:off', namespaces)
                extent = transform.find('a:ext', namespaces)
                bounds = operation['pptxPlacement']['bounds']
                for key, actual in [('x', offset.attrib['x']), ('y', offset.attrib['y']), ('width', extent.attrib['cx']), ('height', extent.attrib['cy'])]:
                    assert abs(int(actual) - bounds[key] * 9525) <= 2, f'Image placement mismatch: {key}'
                crop = picture.find('p:blipFill/a:srcRect', namespaces)
                for side, amount in operation['pptxPlacement']['crop'].items():
                    assert crop is not None and abs(int(crop.attrib.get(side, '0')) - amount * 100000) <= 1, 'Image crop mismatch'
            for shape in shapes + slide.findall('.//p:pic', namespaces):
                transform = shape.find('.//a:xfrm', namespaces)
                if transform is None:
                    continue
                offset = transform.find('a:off', namespaces)
                extent = transform.find('a:ext', namespaces)
                left, top = int(offset.attrib['x']), int(offset.attrib['y'])
                width, height = int(extent.attrib['cx']), int(extent.attrib['cy'])
                rotation = math.radians(int(transform.attrib.get('rot', '0')) / 60000)
                half_width = abs(width * math.cos(rotation)) / 2 + abs(height * math.sin(rotation)) / 2
                half_height = abs(width * math.sin(rotation)) / 2 + abs(height * math.cos(rotation)) / 2
                center_x, center_y = left + width / 2, top + height / 2
                assert center_x - half_width >= -1000 and center_y - half_height >= -1000, f'Slide {index}: rotated negative position'
                assert center_x + half_width <= manifest['width'] * 9525 + 1000, f'Slide {index}: rotated horizontal overflow'
                assert center_y + half_height <= manifest['height'] * 9525 + 1000, f'Slide {index}: rotated vertical overflow'
                assert left >= -1000 and top >= -1000, f'Slide {index}: negative position'
                assert left + width <= manifest['width'] * 9525 + 1000, f'Slide {index}: horizontal overflow'
                assert top + height <= manifest['height'] * 9525 + 1000, f'Slide {index}: vertical overflow'
            notes = ET.fromstring(archive.read(f'ppt/notesSlides/notesSlide{index}.xml'))
            assert normalized(expected['notes']) in normalized(''.join(notes.itertext())), f'Slide {index}: missing notes'
            report['slides'].append({'slide': index, 'editable_text_objects': len(text_shapes),
                                     'paragraphs': sum(operation.get('editMode') == 'paragraph' for operation in operations),
                                     'minimum_css_px': min(run['fontSize'] for operation in operations for run in operation.get('runs', [operation])) if operations else None,
                                     'native_shapes': len(shapes), 'images': len(slide.findall('.//p:pic', namespaces)),
                                     'text_complete': True, 'colors_preserved': True, 'no_auto_shrink': True, 'bounds_passed': True})
except (AssertionError, KeyError, TypeError, IndexError, StopIteration, ValueError, OSError, ET.ParseError, zipfile.BadZipFile) as error:
    report['errors'].append(str(error))
report['structural_passed'] = not report['warnings'] and not report['errors']
visual_path = directory / 'visual-verification.json'
if visual_path.exists():
    visual = json.loads(visual_path.read_text(encoding='utf-8'))
    if visual.get('pptx_sha256') == hashlib.sha256(deck.read_bytes()).hexdigest():
        report['visual_status'] = visual.get('status', 'needs_review')
report['all_passed'] = report['structural_passed'] and report['visual_status'] == 'reviewed'
(directory / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'slides': len(source), 'editable_text_objects': sum(slide['editable_text_objects'] for slide in report['slides']),
                  'structural_passed': report['structural_passed'], 'visual_status': report['visual_status'], 'all_passed': report['all_passed'], 'warnings': report['warnings'], 'errors': report['errors']}, ensure_ascii=True))
if not report['structural_passed']:
    raise SystemExit('Resolve export warnings before delivery.')
