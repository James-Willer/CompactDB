import json
import os

def split_json_file(input_file, chunk_size=100):
    # Read the input JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Calculate number of chunks needed
    total_entries = len(data)
    num_chunks = (total_entries + chunk_size - 1) // chunk_size  # Ceiling division
    
    # Create output directory if it doesn't exist
    output_dir = '../data/chunks'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Split and write chunks
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_entries)
        chunk_data = data[start_idx:end_idx]
        
        # Create filename with index
        output_file = os.path.join(output_dir, f'chunk_{i+1:03d}.json')
        # Convert to absolute path relative to repository root
        output_file = os.path.abspath(output_file)
        
        # Write chunk to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, indent=2)
        
        print(f'Created {output_file} with {len(chunk_data)} entries')
    
    print(f'\nTotal entries: {total_entries}')
    print(f'Number of chunks created: {num_chunks}')
    print(f'Entries per chunk: {chunk_size}')

if __name__ == '__main__':
    # You can adjust the chunk_size parameter based on your needs
    split_json_file('database.json', chunk_size=100)
