import json
import sys
import re
from datetime import datetime
from fpdf import FPDF
import os
from io import BytesIO
import base64

class NLPContentEnhancer:
    def __init__(self):
        self.action_verbs = [
            'Achieved', 'Administered', 'Analyzed', 'Architected', 'Built', 'Collaborated',
            'Created', 'Designed', 'Developed', 'Directed', 'Enhanced', 'Established',
            'Executed', 'Facilitated', 'Generated', 'Implemented', 'Improved', 'Increased',
            'Led', 'Managed', 'Optimized', 'Orchestrated', 'Pioneered', 'Produced',
            'Programmed', 'Redesigned', 'Reduced', 'Resolved', 'Spearheaded', 'Streamlined',
            'Supervised', 'Transformed', 'Utilized', 'Validated'
        ]

    def enhance_career_objective(self, objective, profile_data):
        if not objective or len(objective.strip()) < 20:
            return self.generate_objective_from_profile(profile_data)

        enhanced = objective
        replacements = {
            r'\bwant to\b': 'aspire to',
            r'\bhope to\b': 'aim to',
            r'\btry to\b': 'strive to',
            r'\bget a job\b': 'secure a position',
            r'\bwork in\b': 'contribute to',
            r'\blearn\b': 'develop expertise in',
            r'\bgood at\b': 'proficient in'
        }

        for pattern, replacement in replacements.items():
            enhanced = re.sub(pattern, replacement, enhanced, flags=re.IGNORECASE)

        if not enhanced.startswith(('Seeking', 'Aspiring', 'Dedicated', 'Experienced')):
            enhanced = f"Seeking to {enhanced.lower()}"

        return enhanced.strip()

    def generate_objective_from_profile(self, profile_data):
        degree = str(profile_data.get('bachelor_degree', '')).lower()
        experience = str(profile_data.get('workExperience', ''))

        if 'engineer' in degree or 'computer' in degree:
            if len(experience) > 200:
                return "Experienced software professional seeking challenging opportunities to leverage technical expertise in developing innovative solutions and leading high-impact projects in dynamic technology environments."
            else:
                return "Aspiring software engineer seeking to apply strong technical foundation and problem-solving skills to contribute to innovative technology projects while developing professional expertise."
        elif 'business' in degree or 'management' in degree:
            if len(experience) > 200:
                return "Results-driven business professional with proven track record in strategic planning and team leadership, seeking senior opportunities to drive organizational growth and operational excellence."
            else:
                return "Motivated business professional seeking to apply analytical thinking and leadership potential in dynamic organizational environment while contributing to strategic business objectives."
        else:
            return "Dedicated professional seeking challenging opportunities to utilize educational background, technical competencies, and interpersonal skills to contribute meaningfully to organizational success."

    def enhance_work_experience(self, experience):
        if not experience:
            return experience

        lines = experience.split('\n')
        enhanced_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if line.startswith('•') or line.startswith('-'):
                clean_line = re.sub(r'^[•\-]\s*', '', line)
                starts_with_action = any(clean_line.startswith(verb) for verb in self.action_verbs)

                if not starts_with_action:
                    if any(word in clean_line.lower() for word in ['develop', 'build', 'create']):
                        clean_line = f"Developed {clean_line.lower()}"
                    elif any(word in clean_line.lower() for word in ['manage', 'lead', 'supervise']):
                        clean_line = f"Managed {clean_line.lower()}"
                    elif any(word in clean_line.lower() for word in ['analyze', 'research', 'study']):
                        clean_line = f"Analyzed {clean_line.lower()}"
                    else:
                        clean_line = f"Executed {clean_line.lower()}"

                enhanced_lines.append(f"• {clean_line.capitalize()}")
            else:
                enhanced_lines.append(line)

        return '\n'.join(enhanced_lines)

class SimpleResumeGenerator:
    def __init__(self, template_name='professional'):
        self.template_name = template_name
        self.nlp_enhancer = NLPContentEnhancer()

    def add_section_header(self, pdf, title):
        pdf.set_font('Helvetica', 'B', 14)
        pdf.set_text_color(44, 62, 80)
        pdf.cell(0, 10, title, 0, new_x='LMARGIN', new_y='NEXT', align='L')
        pdf.set_text_color(0, 0, 0)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)

    def add_subsection(self, pdf, title, content):
        if content:
            pdf.set_font('Helvetica', 'B', 12)
            pdf.cell(0, 8, title, 0, new_x='LMARGIN', new_y='NEXT', align='L')
            pdf.set_font('Helvetica', '', 11)

            if '•' in content or content.startswith('-'):
                for line in content.split('\n'):
                    line = line.strip()
                    if line:
                        pdf.cell(10)
                        pdf.multi_cell(0, 6, line, 0, 'L')
            else:
                pdf.multi_cell(0, 6, content, 0, 'L')

            pdf.ln(3)

    def generate_resume(self, profile_data, output_path):
        try:
            print("Incoming profile data:", json.dumps(profile_data, indent=4))

            pdf = FPDF()
            pdf.add_page()

            # Header
            full_name = str(profile_data.get('fullName', '')).upper()
            pdf.set_font('Helvetica', 'B', 24)
            pdf.set_text_color(44, 62, 80)
            pdf.cell(0, 15, full_name, 0, new_x='LMARGIN', new_y='NEXT', align='C')

            # Contact information
            pdf.set_font('Helvetica', '', 11)
            pdf.set_text_color(0, 0, 0)
            contact_info = []
            if profile_data.get('email'): contact_info.append(f"Email: {profile_data['email']}")
            if profile_data.get('phoneNumber'): contact_info.append(f"Phone: {profile_data['phoneNumber']}")
            if profile_data.get('address'): contact_info.append(f"Address: {profile_data['address']}")

            if contact_info:
                pdf.cell(0, 7, " | ".join(contact_info), 0, new_x='LMARGIN', new_y='NEXT', align='C')

            # Professional links
            links = []
            if profile_data.get('linkedinProfile'): links.append(f"LinkedIn: {profile_data['linkedinProfile']}")
            if profile_data.get('portfolioGithub'): links.append(f"Portfolio: {profile_data['portfolioGithub']}")

            if links:
                pdf.cell(0, 7, " | ".join(links), 0, new_x='LMARGIN', new_y='NEXT', align='C')

            pdf.ln(10)

            # Career Objective
            career_objective = profile_data.get('careerObjective', '')
            if career_objective:
                enhanced_objective = self.nlp_enhancer.enhance_career_objective(career_objective, profile_data)
                self.add_section_header(pdf, "CAREER OBJECTIVE")
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, enhanced_objective, 0, 'J')
                pdf.ln(10)

            # Education Section
            self.add_section_header(pdf, "EDUCATION")
            if profile_data.get('master_degree'):
                self.add_subsection(pdf, "Master's Degree",
                    f"{profile_data['master_degree']} | {profile_data.get('master_college', '')} | Year: {profile_data.get('master_year', '')} | CGPA: {profile_data.get('master_cgpa', '')}")

            if profile_data.get('bachelor_degree'):
                self.add_subsection(pdf, "Bachelor's Degree",
                    f"{profile_data['bachelor_degree']} | {profile_data.get('bachelor_college', '')} | Year: {profile_data.get('bachelor_year', '')} | CGPA: {profile_data.get('bachelor_cgpa', '')}")

            if profile_data.get('twelfth_board'):
                self.add_subsection(pdf, "Higher Secondary",
                    f"12th Standard - {profile_data.get('twelfth_stream', 'General')} | {profile_data.get('twelfth_school', '')} ({profile_data.get('twelfth_board', '')}) | Year: {profile_data.get('twelfth_year', '')} | Percentage: {profile_data.get('twelfth_percentage', '')}")

            if profile_data.get('tenth_board'):
                self.add_subsection(pdf, "Secondary Education",
                    f"10th Standard | {profile_data.get('tenth_school', '')} ({profile_data.get('tenth_board', '')}) | Year: {profile_data.get('tenth_year', '')} | Percentage: {profile_data.get('tenth_percentage', '')}")

            if profile_data.get('additional_qualifications'):
                self.add_subsection(pdf, "Additional Qualifications", profile_data['additional_qualifications'])

            # Skills Section
            if profile_data.get('technical_skills') or profile_data.get('soft_skills'):
                self.add_section_header(pdf, "SKILLS & COMPETENCIES")
                if profile_data.get('technical_skills'):
                    self.add_subsection(pdf, "Technical Skills", profile_data['technical_skills'])
                if profile_data.get('soft_skills'):
                    self.add_subsection(pdf, "Soft Skills", profile_data['soft_skills'])

            # Work Experience
            if profile_data.get('workExperience'):
                self.add_section_header(pdf, "WORK EXPERIENCE")
                enhanced_experience = self.nlp_enhancer.enhance_work_experience(profile_data['workExperience'])
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, enhanced_experience, 0, 'L')

            # Projects
            if profile_data.get('projects'):
                self.add_section_header(pdf, "PROJECTS")
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, profile_data['projects'], 0, 'L')

            # Certifications
            if profile_data.get('certifications'):
                self.add_section_header(pdf, "CERTIFICATIONS & TRAINING")
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, profile_data['certifications'], 0, 'L')

            # Achievements
            if profile_data.get('achievements'):
                self.add_section_header(pdf, "ACHIEVEMENTS & AWARDS")
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, profile_data['achievements'], 0, 'L')

            # Languages and Hobbies
            if profile_data.get('languagesKnown') or profile_data.get('hobbies'):
                self.add_section_header(pdf, "ADDITIONAL INFORMATION")
                if profile_data.get('languagesKnown'):
                    self.add_subsection(pdf, "Languages Known", profile_data['languagesKnown'])
                if profile_data.get('hobbies'):
                    self.add_subsection(pdf, "Hobbies & Interests", profile_data['hobbies'])

            # References
            if profile_data.get('references'):
                self.add_section_header(pdf, "REFERENCES")
                pdf.set_font('Helvetica', '', 11)
                pdf.multi_cell(0, 6, profile_data['references'], 0, 'L')

            # Save PDF
            pdf.output(output_path)
            return True

        except Exception as e:
            print(f"Error generating resume: {str(e)}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return False
if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        profile_data = json.loads(raw_input)

        generator = SimpleResumeGenerator()
        output_path = os.path.join("resumes", f"Resume_{str(profile_data.get('fullName', 'User')).replace(' ', '_')}.pdf")

        success = generator.generate_resume(profile_data, output_path)

        if success:
            result = {
                "status": "success",
                "file_path": output_path
            }
        else:
            result = {
                "status": "error",
                "message": "Resume generation failed due to internal error"
            }

    except Exception as e:
        result = {
            "status": "error",
            "message": str(e)
        }

    # Ensure clean JSON output
    print(json.dumps(result, ensure_ascii=False))
